import http from 'http';
import { Application } from 'express';
import { Server } from 'socket.io';
import { verifyJwt } from '../../../shared/utils/jwt';
import { LLMService } from './llm.service';
import { VectorStoreService } from '../../../domains/vector/services/vector-store.service';
import { redisChatHistory } from '../../../infrastructure/database/repositories/redis.repo';
import { UserInputSchema } from '../../../domains/auth/validators/user-input.validator';
import { EnrichmentService } from './enrichment.service';
import { PostgresService } from '../../../infrastructure/database/repositories/postgres.repository';
import { IDBStore } from '../../../shared/interfaces/db-store.interface';
import { DeepResearchService } from './deep-research.service';
import { FetchHTMLService } from './fetch.service';
import { logger } from '../../../config/logger.config';
import { config } from '../../../config/app.config';

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
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
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
        origin:
          process.env.NODE_ENV === 'production'
            ? process.env.FRONTEND_URL
            : '*',
        methods: ['GET', 'POST'],
      },
    });

    this.initServices();

    this.authVerification();
    this.onConnection();
  }

  authVerification() {
    this.io.use((socket, next) => {
      const authHeader = socket.handshake.headers.authorization;
      let token: string | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        token = socket.handshake.auth?.token;
        if (token) {
          this.logger.warn(
            { ip: socket.handshake.address },
            'Using deprecated auth object for WebSocket token. Please use Authorization header instead.',
          );
        }
      }

      if (!token) {
        this.logger.warn(
          { ip: socket.handshake.address },
          'No token provided in WebSocket handshake',
        );
        return next(new Error('No token provided'));
      }

      const decoded = verifyJwt(token);
      if (!decoded) {
        this.logger.warn(
          { ip: socket.handshake.address },
          'Invalid token provided in WebSocket handshake',
        );
        return next(new Error('Invalid token'));
      }

      let userId = (decoded as any).sub;

      if (!userId) {
        const legacyId = (decoded as any).id ?? (decoded as any).userId;
        if (legacyId) {
          this.logger.warn(
            {
              legacyClaim: (decoded as any).id ? 'id' : 'userId',
              tokenIssuedAt: (decoded as any).iat,
              tokenExpiresAt: (decoded as any).exp,
              ip: socket.handshake.address,
            },
            'Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token.',
          );
          userId = legacyId;
        }
      }

      if (!userId) {
        this.logger.warn(
          { ip: socket.handshake.address },
          'Invalid token: missing subject claim',
        );
        return next(new Error('Invalid token: missing subject claim'));
      }

      (socket as any).userId = String(userId);
      (socket as any).tokenExp = (decoded as any).exp;

      this.logger.info(
        { userId, ip: socket.handshake.address },
        'WebSocket authentication successful',
      );

      next();
    });
  }

  onConnection() {
    this.io.on('connection', (socket) => {
      const userId = (socket as any).userId;
      this.logger.info({ userId }, 'User connected');
      socket.join(userId);

      this.onQuestion(socket);

      socket.on('disconnect', () => {
        this.logger.info({ userId }, 'User disconnected');
      });
    });
  }

  onQuestion(socket: any) {
    socket.on(
      'question',
      async ({
        fileId,
        question,
      }: {
        fileId: string;
        question: string;
        chatHistory: string[];
      }) => {
        const userId = (socket as any).userId;
        try {
          this.logger.info({ userId, question }, 'Incoming message');

          await this.processQuestion(question, userId, fileId);
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
      },
    );
  }

  private async processQuestion(
    question: string,
    userId: string,
    fileId: string,
  ) {
    if (!question || typeof question !== 'string' || question.trim() === '') {
      throw new Error('Question cannot be empty');
    }

    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
      throw new Error('File ID is required');
    }

    try {
      const chatId = await this.getOrCreateChat(userId, fileId);
      await this.appendChatHistory(userId, fileId, `User: ${question}`);
      await this.appendChatMessage(chatId, 'user', question);

      const qEmbedding = await this.llmService.getEmbedding(question);

      const topK = config.PINECONE_TOP_K;
      const results = await this.pineconeService.query(
        qEmbedding,
        userId,
        fileId,
        topK,
      );

      if (!results.matches.length) {
        const noContextMsg =
          "No relevant context found. I don't know the answer.";
        this.io.to(userId).emit('answer_chunk', { token: noContextMsg });
        this.io.to(userId).emit('answer_complete');

        await this.appendChatHistory(userId, fileId, `AI: ${noContextMsg}`);
        await this.appendChatMessage(chatId, 'ai', noContextMsg);
        return;
      }

      const context = await this.pineconeService.getContextWithSummarization(
        results,
        topK,
      );

      const chatHistory = await this.getChatHistory(userId, fileId);

      const fullPrompt = UserInputSchema.parse({
        question,
        chatHistory,
        context,
      });

      let fullAnswer = '';
      let streamSuccessful = false;

      try {
        for await (const token of this.llmService.generateAnswerStream(
          fullPrompt,
        )) {
          this.io.to(userId).emit('answer_chunk', { token });
          fullAnswer += token;
        }

        streamSuccessful = true;

        if (fullAnswer.toLowerCase().includes("i don't know")) {
          this.io.to(userId).emit('search_status', {
            message: 'Searching external sources for more information...',
          });

          try {
            const enrichedResults =
              await this.llmService.enrichmentService?.searchAndEmbed(
                question,
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
              const enrichedContext = enrichedResults
                .map((r) => `${r.title}: ${r.snippet}`)
                .join('\n\n');

              this.io.to(userId).emit('search_status', {
                message:
                  'Found additional information. Generating enhanced answer...',
              });

              fullAnswer = '';
              for await (const token of this.llmService.generateAnswerStreamWithEnrichment(
                fullPrompt,
                enrichedContext,
              )) {
                this.io.to(userId).emit('answer_chunk', { token });
                fullAnswer += token;
              }
            }
          } catch (enrichmentError) {
            this.logger.warn(
              { enrichmentError },
              'Enrichment failed, using original answer',
            );
          }
        }

        await this.appendChatHistory(userId, fileId, `AI: ${fullAnswer}`);
        await this.appendChatMessage(chatId, 'ai', fullAnswer);
        await this.trimChatHistory(userId, fileId);

        this.io.to(userId).emit('answer_complete');
      } catch (err: unknown) {
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
    } catch (err: unknown) {
      this.logger.error({ err }, 'Error in processQuestion');
      if (err instanceof Error) {
        this.io.to(userId).emit('error', { message: 'Something went wrong' });
      }
    }
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
    this.llmService.enrichmentService = new EnrichmentService(
      this.llmService,
      this.pineconeService,
      this.fetchHTMLService,
      this.deepResearchService,
    );
  }
}
