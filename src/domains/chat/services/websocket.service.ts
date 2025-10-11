import http from 'http';
import { Application } from 'express';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { verifyJwt } from '@utils/jwt';
import { LLMService } from './llm.service';
import { VectorStoreService } from '@vector/services/vector-store.service';
import { redisChatHistory } from '@database/repositories/redis.repo';
import { UserInputSchema } from '@auth/validators/user-input.validator';
import { EnrichmentService } from './enrichment.service';
import { IDBStore } from '@interfaces/db-store.interface';
import { DeepResearchService } from './deep-research.service';
import { FetchHTMLService } from './fetch.service';
import { logger } from '@config/logger.config';
import { config } from '@config';

interface AuthenticatedSocket extends Socket {
  userId: string;
  tokenExp?: number;
}

const QuestionPayloadSchema = z.object({
  fileId: z
    .string()
    .min(1, 'fileId is required and must be a non-empty string'),
  question: z
    .string()
    .min(1, 'question is required and must be a non-empty string'),
});

export class WebsocketService {
  public io: Server;
  private server: http.Server;
  private db: IDBStore;
  private llmService: LLMService;
  private pineconeService: VectorStoreService;
  private fetchHTMLService: FetchHTMLService;
  private deepResearchService: DeepResearchService;
  private logger = logger;

  constructor(
    app: Application,
    llmService: LLMService,
    pineconeService: VectorStoreService,
    db: IDBStore,
    fetchHTMLService?: FetchHTMLService,
    deepResearchService?: DeepResearchService,
  ) {
    if (config.NODE_ENV === 'production' && !config.FRONTEND_URL) {
      this.logger.fatal(
        'FRONTEND_URL environment variable is required in production but is not set',
      );
      throw new Error(
        'FRONTEND_URL environment variable is required in production. Please set it to your frontend application URL.',
      );
    }

    this.server = http.createServer(app);
    this.db = db;
    this.llmService = llmService;
    this.pineconeService = pineconeService;
    this.fetchHTMLService = fetchHTMLService || new FetchHTMLService();
    this.deepResearchService =
      deepResearchService || new DeepResearchService(this.llmService);

    this.io = new Server(this.server, {
      cors: {
        origin: config.NODE_ENV === 'production' ? config.FRONTEND_URL : '*',
        methods: ['GET', 'POST'],
      },
    });

    this.initServices();

    this.authVerification();
    this.onConnection();
  }

  authVerification() {
    this.io.use((socket, next) => {
      const token = this.extractToken(socket);
      if (!token) {
        return this.handleMissingToken(socket, next);
      }

      const decoded = verifyJwt(token);
      if (!decoded) {
        return this.handleInvalidToken(socket, next);
      }

      const userId = this.extractUserId(decoded, socket);
      if (!userId) {
        return this.handleMissingUserId(socket, next);
      }

      this.authenticateSocket(socket, userId, decoded);
      next();
    });
  }

  private extractToken(socket: {
    handshake: {
      headers: { authorization?: string };
      auth?: { token?: string };
      address: string;
    };
  }): string | undefined {
    const authHeader = socket.handshake.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const token = socket.handshake.auth?.token;
    if (token) {
      this.logger.warn(
        { ip: socket.handshake.address },
        'Using deprecated auth object for WebSocket token. Please use Authorization header instead.',
      );
    }

    return token;
  }

  private handleMissingToken(
    socket: { handshake: { address: string } },
    next: (error?: Error) => void,
  ): void {
    this.logger.warn(
      { ip: socket.handshake.address },
      'No token provided in WebSocket handshake',
    );
    next(new Error('No token provided'));
  }

  private handleInvalidToken(
    socket: { handshake: { address: string } },
    next: (error?: Error) => void,
  ): void {
    this.logger.warn(
      { ip: socket.handshake.address },
      'Invalid token provided in WebSocket handshake',
    );
    next(new Error('Invalid token'));
  }

  private extractUserId(
    decoded: {
      sub?: string;
      id?: string;
      userId?: string;
      iat?: number;
      exp?: number;
    },
    socket: { handshake: { address: string } },
  ): string | undefined {
    let userId = (decoded as { sub?: string }).sub;

    if (!userId) {
      userId = this.handleLegacyToken(decoded, socket);
    }

    return userId;
  }

  private handleLegacyToken(
    decoded: { id?: string; userId?: string; iat?: number; exp?: number },
    socket: { handshake: { address: string } },
  ): string | undefined {
    const decodedWithLegacy = decoded as {
      id?: string;
      userId?: string;
      iat?: number;
      exp?: number;
    };
    const legacyId = decodedWithLegacy.id ?? decodedWithLegacy.userId;

    if (legacyId) {
      this.logger.warn(
        {
          legacyClaim: decodedWithLegacy.id ? 'id' : 'userId',
          tokenIssuedAt: decodedWithLegacy.iat,
          tokenExpiresAt: decodedWithLegacy.exp,
          ip: socket.handshake.address,
        },
        'Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token.',
      );
    }

    return legacyId;
  }

  private handleMissingUserId(
    socket: { handshake: { address: string } },
    next: (error?: Error) => void,
  ): void {
    this.logger.warn(
      { ip: socket.handshake.address },
      'Invalid token: missing subject claim',
    );
    next(new Error('Invalid token: missing subject claim'));
  }

  private authenticateSocket(
    socket: { handshake: { address: string } },
    userId: string,
    decoded: { exp?: number },
  ): void {
    const authenticatedSocket = socket as AuthenticatedSocket;
    authenticatedSocket.userId = String(userId);
    authenticatedSocket.tokenExp = (decoded as { exp?: number }).exp;

    this.logger.info(
      { userId, ip: socket.handshake.address },
      'WebSocket authentication successful',
    );
  }

  onConnection() {
    this.io.on('connection', (socket) => {
      const authenticatedSocket = socket as AuthenticatedSocket;
      const userId = authenticatedSocket.userId;
      this.logger.info({ userId }, 'User connected');
      if (userId) {
        socket.join(userId);
      }

      this.onQuestion(authenticatedSocket);

      socket.on('disconnect', () => {
        this.logger.info({ userId }, 'User disconnected');
      });
    });
  }

  onQuestion(socket: AuthenticatedSocket) {
    socket.on('question', async (data: unknown) => {
      const userId = socket.userId;
      try {
        // Validate payload using Zod schema
        const validationResult = QuestionPayloadSchema.safeParse(data);

        if (!validationResult.success) {
          const errorMessages = validationResult.error.issues
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join(', ');
          throw new Error(`Invalid payload: ${errorMessages}`);
        }

        const { fileId, question } = validationResult.data;

        this.logger.info({ userId, question }, 'Incoming message');

        if (userId) {
          await this.processQuestion(question, userId, fileId);
        }
      } catch (err: unknown) {
        this.logger.error(
          { err },
          'An error occurred during question processing',
        );
        const errorMessage =
          err instanceof Error
            ? err.message
            : String(err) || 'something went wrong';
        socket.emit('error', { message: errorMessage });
      }
    });
  }

  private async processQuestion(
    question: string,
    userId: string,
    fileId: string,
  ) {
    this.validateQuestionInput(question, fileId);

    try {
      const chatId = await this.initializeChatSession(question, userId, fileId);
      const results = await this.queryVectorStore(question, userId, fileId);

      if (!results.matches.length) {
        await this.handleNoContextResponse(userId, fileId, chatId);
        return;
      }

      const context = await this.pineconeService.getContextWithSummarization(
        results,
        config.PINECONE_TOP_K,
      );

      const chatHistory = await this.getChatHistory(userId, fileId);
      const fullPrompt = UserInputSchema.parse({
        question,
        chatHistory,
        context,
      });

      await this.generateAndStreamAnswer(fullPrompt, userId, fileId, chatId);
    } catch (err: unknown) {
      this.logger.error({ err }, 'Error in processQuestion');
      if (err instanceof Error) {
        this.io.to(userId).emit('error', { message: 'Something went wrong' });
      }
    }
  }

  private validateQuestionInput(question: string, fileId: string): void {
    if (!question || typeof question !== 'string' || question.trim() === '') {
      throw new Error('Question cannot be empty');
    }

    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
      throw new Error('File ID is required');
    }
  }

  private async initializeChatSession(
    question: string,
    userId: string,
    fileId: string,
  ): Promise<string> {
    const chatId = await this.getOrCreateChat(userId, fileId);
    await this.appendChatHistory(userId, fileId, `User: ${question}`);
    await this.appendChatMessage(chatId, 'user', question);
    return chatId;
  }

  private async queryVectorStore(
    question: string,
    userId: string,
    fileId: string,
  ) {
    const qEmbedding = await this.llmService.getEmbedding(question);
    const topK = config.PINECONE_TOP_K;
    return await this.pineconeService.query(qEmbedding, userId, fileId, topK);
  }

  private async handleNoContextResponse(
    userId: string,
    fileId: string,
    chatId: string,
  ): Promise<void> {
    const noContextMsg = "No relevant context found. I don't know the answer.";
    this.io.to(userId).emit('answer_chunk', { token: noContextMsg });
    this.io.to(userId).emit('answer_complete');

    await this.appendChatHistory(userId, fileId, `AI: ${noContextMsg}`);
    await this.appendChatMessage(chatId, 'ai', noContextMsg);
  }

  private async generateAndStreamAnswer(
    fullPrompt: z.infer<typeof UserInputSchema>,
    userId: string,
    fileId: string,
    chatId: string,
  ): Promise<void> {
    let fullAnswer = '';

    try {
      fullAnswer = await this.streamAnswerTokens(fullPrompt, userId);
      await this.handleAnswerResponse(
        fullAnswer,
        fullPrompt,
        userId,
        fileId,
        chatId,
      );
    } catch (err: unknown) {
      await this.handleStreamError(err, fullAnswer, userId, chatId);
    }
  }

  private async streamAnswerTokens(
    fullPrompt: z.infer<typeof UserInputSchema>,
    userId: string,
  ): Promise<string> {
    let fullAnswer = '';

    for await (const token of this.llmService.generateAnswerStream(
      fullPrompt,
    )) {
      this.io.to(userId).emit('answer_chunk', { token });
      fullAnswer += token;
    }

    return fullAnswer;
  }

  private async handleAnswerResponse(
    fullAnswer: string,
    fullPrompt: z.infer<typeof UserInputSchema>,
    userId: string,
    fileId: string,
    chatId: string,
  ): Promise<void> {
    if (fullAnswer.toLowerCase().includes("i don't know")) {
      await this.handleEnrichmentFlow(
        fullPrompt,
        userId,
        fileId,
        chatId,
        fullAnswer,
      );
      return;
    }

    await this.finalizeAnswer(fullAnswer, userId, fileId, chatId);
  }

  private async handleEnrichmentFlow(
    fullPrompt: z.infer<typeof UserInputSchema>,
    userId: string,
    fileId: string,
    chatId: string,
    originalAnswer: string,
  ): Promise<void> {
    this.io.to(userId).emit('search_status', {
      message: 'Searching external sources for more information...',
    });

    try {
      this.validateServices();

      const enrichedResults =
        await this.llmService.enrichmentService!.searchAndEmbed(
          fullPrompt.question,
          {
            fileId,
            userId,
            maxResults: 5,
            maxPagesToFetch: 3,
            fetchConcurrency: 2,
            minContentLength: 200,
          },
        );

      if (enrichedResults && enrichedResults.length > 0) {
        await this.generateEnrichedAnswer(
          fullPrompt,
          enrichedResults,
          userId,
          fileId,
          chatId,
        );
        return;
      }

      await this.finalizeAnswer(originalAnswer, userId, fileId, chatId);
    } catch (enrichmentError) {
      this.logger.warn(
        { enrichmentError },
        'Enrichment failed, using original answer',
      );
      await this.finalizeAnswer(originalAnswer, userId, fileId, chatId);
    }
  }

  private async generateEnrichedAnswer(
    fullPrompt: z.infer<typeof UserInputSchema>,
    enrichedResults: { title: string; snippet: string }[],
    userId: string,
    fileId: string,
    chatId: string,
  ): Promise<void> {
    const enrichedContext = enrichedResults
      .map((r) => `${r.title}: ${r.snippet}`)
      .join('\n\n');

    this.io.to(userId).emit('search_status', {
      message: 'Found additional information. Generating enhanced answer...',
    });

    let fullAnswer = '';
    for await (const token of this.llmService.generateAnswerStreamWithEnrichment(
      fullPrompt,
      enrichedContext,
    )) {
      this.io.to(userId).emit('answer_chunk', { token });
      fullAnswer += token;
    }

    await this.finalizeAnswer(fullAnswer, userId, fileId, chatId);
  }

  private async finalizeAnswer(
    fullAnswer: string,
    userId: string,
    fileId: string,
    chatId: string,
  ): Promise<void> {
    await this.appendChatHistory(userId, fileId, `AI: ${fullAnswer}`);
    await this.appendChatMessage(chatId, 'ai', fullAnswer);
    await this.trimChatHistory(userId, fileId);
    this.io.to(userId).emit('answer_complete');
  }

  private async handleStreamError(
    err: unknown,
    fullAnswer: string,
    userId: string,
    chatId: string,
  ): Promise<void> {
    this.logger.error(
      { err, partialAnswer: fullAnswer.substring(0, 100) },
      'Stream error',
    );

    this.io.to(userId).emit('error', {
      message: 'Failed to generate complete answer. Please try again.',
    });

    await this.appendChatMessage(
      chatId,
      'ai',
      `Error: ${(err as Error).message}`,
    );
  }

  private async appendChatHistory(
    userId: string,
    fileId: string,
    message: string,
  ) {
    const key = `chat:${userId}:${fileId}`;
    await redisChatHistory.rPush(key, message);
    await redisChatHistory.expire(key, 60 * 60 * 24);
  }

  private async getChatHistory(
    userId: string,
    fileId: string,
  ): Promise<string[]> {
    const key = `chat:${userId}:${fileId}`;
    return await redisChatHistory.lRange(key, 0, -1);
  }

  private async trimChatHistory(
    userId: string,
    fileId: string,
    maxEntries = 100,
  ) {
    const key = `chat:${userId}:${fileId}`;
    await redisChatHistory.lTrim(key, -maxEntries, -1);
  }

  getServer(): http.Server {
    return this.server;
  }

  private async getOrCreateChat(
    userId: string,
    fileId?: string,
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO chats(user_id, file_id) 
       VALUES($1, $2) 
       ON CONFLICT (user_id, file_id) 
       DO UPDATE SET updated_at = now() 
       RETURNING id`,
      [userId, fileId ?? null],
    );
    return result.rows[0]!.id;
  }

  private async appendChatMessage(
    chatId: string,
    sender: 'user' | 'ai',
    message: string,
  ) {
    await this.db.query(
      'INSERT INTO chat_messages(chat_id, sender, message) VALUES($1, $2, $3)',
      [chatId, sender, message],
    );
  }

  private initServices() {
    try {
      this.logger.info('Initializing enrichment service...');
      this.llmService.enrichmentService = new EnrichmentService(
        this.llmService,
        this.pineconeService,
        this.fetchHTMLService,
        this.deepResearchService,
      );
      this.logger.info('Enrichment service initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize enrichment service');
      throw new Error(
        `Failed to initialize enrichment service: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private validateServices() {
    if (!this.llmService.enrichmentService) {
      this.logger.error(
        'EnrichmentService validation failed: service is not initialized',
      );
      throw new Error(
        'EnrichmentService is not available. Service initialization failed.',
      );
    }
  }
}
