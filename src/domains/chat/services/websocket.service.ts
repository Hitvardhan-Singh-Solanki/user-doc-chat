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

export class WebsocketService {
  public io: Server;
  private static instance: WebsocketService;
  private server: http.Server;
  private db: IDBStore;
  private llmService!: LLMService;
  private pineconeService!: VectorStoreService;
  private fetchHTMLService!: FetchHTMLService;
  private deepResearchService!: DeepResearchService;
  private logger = logger;

  private constructor(app: Application) {
    // Runtime validation for production environment
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
      this.logger.fatal(
        'FRONTEND_URL environment variable is required in production but is not set',
      );
      throw new Error(
        'FRONTEND_URL environment variable is required in production. Please set it to your frontend application URL.',
      );
    }

    this.server = http.createServer(app);
    this.db = PostgresService.getInstance();

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

  public static getInstance(app: Application): WebsocketService {
    if (!WebsocketService.instance) {
      WebsocketService.instance = new WebsocketService(app);
    }
    return WebsocketService.instance;
  }

  authVerification() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) {
        this.logger.warn('No token provided in WebSocket handshake');
        return next(new Error('No token provided'));
      }

      const decoded = verifyJwt(token);
      if (!decoded) {
        this.logger.warn('Invalid token provided in WebSocket handshake');
        return next(new Error('Invalid token'));
      }
      // RFC-7519 compliant: prioritize 'sub' claim
      let userId = (decoded as any).sub;

      // Migration fallback for legacy tokens (deprecated)
      if (!userId) {
        const legacyId = (decoded as any).id ?? (decoded as any).userId;
        if (legacyId) {
          this.logger.warn(
            {
              legacyClaim: (decoded as any).id ? 'id' : 'userId',
              tokenIssuedAt: (decoded as any).iat,
              tokenExpiresAt: (decoded as any).exp,
            },
            'Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token.',
          );
          userId = legacyId;
        }
      }

      if (!userId) {
        this.logger.warn('Invalid token: missing subject claim');
        return next(new Error('Invalid token: missing subject claim'));
      }
      (socket as any).userId = String(userId);
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
    // Input validation - check before any async operations
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

      const topK = Number(process.env.PINECONE_TOP_K) || 5;
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
      for await (const token of this.llmService.generateAnswerStream(
        fullPrompt,
      )) {
        this.io.to(userId).emit('answer_chunk', { token });
        fullAnswer += token;
      }

      await this.appendChatHistory(userId, fileId, `AI: ${fullAnswer}`);
      await this.appendChatMessage(chatId, 'ai', fullAnswer);
      await this.trimChatHistory(userId, fileId);

      this.io.to(userId).emit('answer_complete');
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
    // append message to redis list
    await redisChatHistory.rPush(key, message);
    // refresh expiry to 24 hours
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
    // Use atomic upsert to prevent TOCTOU race conditions
    // This single statement will either return an existing chat ID or create a new one
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
    this.llmService = new LLMService();

    this.fetchHTMLService = new FetchHTMLService();
    this.deepResearchService = new DeepResearchService(this.llmService);

    this.pineconeService = new VectorStoreService(this.llmService, 'pinecone');

    this.llmService.enrichmentService = new EnrichmentService(
      this.llmService,
      this.pineconeService,
      this.fetchHTMLService,
      this.deepResearchService,
    );
  }
}
