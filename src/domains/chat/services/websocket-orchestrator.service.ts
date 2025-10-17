import http from 'http';
import { Application } from 'express';
import { Server } from 'socket.io';
import { LLMService } from './llm.service';
import { VectorStoreService } from '@vector/services/vector-store.service';
import { IDBStore } from '@interfaces/db-store.interface';
import { DeepResearchService } from './deep-research.service';
import { FetchHTMLService } from './fetch.service';
import { logger } from '@config/logger.config';
import { config } from '@config';
import { WebSocketAuthenticationService } from '@auth/services/websocket-authentication.service';
import { WebSocketConnectionManagerService } from './websocket-connection-manager.service';
import { QuestionPayloadSchema } from '@shared/schemas';
import type {
  AuthenticatedSocket,
  QuestionPayload,
  WebSocketMessageHandler,
} from '@shared/types';

export class WebSocketOrchestratorService implements WebSocketMessageHandler {
  public io: Server;
  private server: http.Server;
  private db: IDBStore;
  private llmService: LLMService;
  private pineconeService: VectorStoreService;
  private fetchHTMLService: FetchHTMLService;
  private deepResearchService: DeepResearchService;
  private authenticationService: WebSocketAuthenticationService;
  private connectionManager: WebSocketConnectionManagerService;
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

    this.authenticationService = new WebSocketAuthenticationService();
    this.connectionManager = new WebSocketConnectionManagerService();

    this.io = new Server(this.server, {
      cors: {
        origin: config.NODE_ENV === 'production' ? config.FRONTEND_URL : '*',
        methods: ['GET', 'POST'],
      },
    });

    this.initServices();
    this.setupAuthentication();
    this.setupConnectionHandlers();
  }

  private initServices(): void {
    this.logger.info('WebSocket services initialized');
  }

  private setupAuthentication(): void {
    this.io.use(async (socket, next) => {
      try {
        const tokenResult = this.authenticationService.extractToken(socket);

        if (!tokenResult.token) {
          this.logger.warn(
            { ip: socket.handshake.address },
            'No token provided in WebSocket handshake',
          );
          return next(new Error('No token provided'));
        }

        const validationResult = await this.authenticationService.validateToken(
          tokenResult.token,
        );

        if (!validationResult.isValid) {
          this.logger.warn(
            { ip: socket.handshake.address },
            'Invalid token provided in WebSocket handshake',
          );
          return next(new Error('Invalid token'));
        }

        this.authenticationService.authenticateSocket(
          socket,
          validationResult.userId!,
          {
            sub: validationResult.userId!,
            email: '',
            exp: validationResult.tokenExp,
          },
        );

        next();
      } catch (error) {
        this.logger.error({ error }, 'Authentication error');
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket) => {
      this.connectionManager.addConnection(socket as AuthenticatedSocket);

      this.logger.info(
        { socketId: socket.id, userId: (socket as AuthenticatedSocket).userId },
        'WebSocket connection established',
      );

      socket.on('question', async (payload: QuestionPayload) => {
        await this.handleMessage(socket as AuthenticatedSocket, payload);
      });

      socket.on('disconnect', () => {
        this.connectionManager.removeConnection(socket.id);
        this.logger.info(
          {
            socketId: socket.id,
            userId: (socket as AuthenticatedSocket).userId,
          },
          'WebSocket connection closed',
        );
      });
    });
  }

  async handleMessage(
    socket: AuthenticatedSocket,
    payload: QuestionPayload,
  ): Promise<void> {
    const log = this.logger.child({
      socketId: socket.id,
      userId: socket.userId,
      fileId: payload.fileId,
    });

    try {
      const parsedPayload = QuestionPayloadSchema.parse(payload);

      log.info('Processing question');

      const hasAccess = await this.verifyFileAccess(
        socket.userId,
        parsedPayload.fileId,
      );
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to file' });
        return;
      }

      const response = await this.processQuestion(parsedPayload, socket.userId);
      socket.emit('response', response);
    } catch (error) {
      log.error({ error }, 'Error processing question');
      socket.emit('error', { message: 'Failed to process question' });
    }
  }

  private async verifyFileAccess(
    userId: string,
    fileId: string,
  ): Promise<boolean> {
    try {
      const result = await this.db.query<{ owner_id: string }>(
        'SELECT owner_id FROM user_files WHERE id = $1',
        [fileId],
      );

      return result.rows.length > 0 && result.rows[0].owner_id === userId;
    } catch (error) {
      this.logger.error({ error }, 'Error verifying file access');
      return false;
    }
  }

  private async processQuestion(
    payload: QuestionPayload,
    _userId: string,
  ): Promise<unknown> {
    const context = await this.retrieveContext(payload.fileId);
    const enrichedContext = await this.enrichContext(payload.question, context);

    const response = await this.llmService.generateText(enrichedContext);

    return response;
  }

  private async retrieveContext(fileId: string): Promise<string> {
    const embedding = await this.llmService.getEmbedding('dummy query');
    const result = await this.pineconeService.query(
      embedding,
      'dummy-user',
      fileId,
    );

    return result.matches
      .map(
        (match: { metadata?: { text?: string } }) => match.metadata?.text || '',
      )
      .join('\n');
  }

  private async enrichContext(
    question: string,
    context: string,
  ): Promise<string> {
    const enrichmentResults = await this.deepResearchService.summarize(context);
    return `${context}\n\nEnriched: ${enrichmentResults}`;
  }

  getConnectionStats() {
    return this.connectionManager.getConnectionStats();
  }
}
