import http from "http";
import { Express } from "express";
import { Server } from "socket.io";
import { verifyJwt } from "../utils/jwt";
import { LLMService } from "./llm.service";
import { VectorStoreService } from "./vector-store.service";
import { redisChatHistory } from "../repos/redis.repo";
import { UserInputSchema } from "../schemas/user-input.schema";
import { EnrichmentService } from "./enrichment.service";
import { PostgresService } from "./postgres.service";
import { IDBStore } from "../interfaces/db-store.interface";
import { DeepResearchService } from "./deep-research.service";
import { FetchHTMLService } from "./fetch.service";

export class WebsocketService {
  public io: Server;
  private static instance: WebsocketService;
  private server: http.Server;
  private db: IDBStore;
  private llmService!: LLMService;
  private pineconeService!: VectorStoreService;
  private fetchHTMLService!: FetchHTMLService;
  private deepResearchService!: DeepResearchService;

  private constructor(app: Express) {
    this.server = http.createServer(app);
    this.db = PostgresService.getInstance();

    this.io = new Server(this.server, {
      cors: {
        origin: "*", //TODO: replace with frontend URL in prod
        methods: ["GET", "POST"],
      },
    });

    this.initServices();

    this.authVerification();
    this.onConnection();
  }

  public static getInstance(app: Express): WebsocketService {
    if (!WebsocketService.instance) {
      WebsocketService.instance = new WebsocketService(app);
    }
    return WebsocketService.instance;
  }

  authVerification() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = verifyJwt(token);
      if (!decoded) return next(new Error("Invalid token"));
      const userId =
        (decoded as any).sub ?? (decoded as any).id ?? (decoded as any).userId;
      if (!userId) return next(new Error("Invalid token: missing subject/id"));
      (socket as any).userId = String(userId);
      next();
    });
  }

  onConnection() {
    this.io.on("connection", (socket) => {
      const userId = (socket as any).userId;
      console.log("✅ User connected:", userId);
      socket.join(userId);

      this.onQuestion(socket);

      socket.on("disconnect", () => {
        console.log("❌ User disconnected:", userId);
      });
    });
  }

  onQuestion(socket: any) {
    socket.on(
      "question",
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
          console.log(`Incoming messsage: ${userId} asked: ${question}`);

          await this.processQuestion(question, userId, fileId);
        } catch (err: unknown) {
          console.error(err);
          if (err instanceof Error)
            socket.emit("error", { message: "something went wrong" });
        }
      }
    );
  }

  private async processQuestion(
    question: string,
    userId: string,
    fileId: string
  ) {
    try {
      const chatId = await this.getOrCreateChat(userId, fileId);
      await this.appendChatHistory(userId, fileId, `User: ${question}`);
      await this.appendChatMessage(chatId, "user", question);

      const qEmbedding = await this.llmService.embeddingHF(question);

      const results = await this.pineconeService.query(
        qEmbedding,
        userId,
        fileId
      );

      if (!results.matches.length) {
        const noContextMsg =
          "No relevant context found. I don't know the answer.";
        this.io.to(userId).emit("answer_chunk", { token: noContextMsg });
        this.io.to(userId).emit("answer_complete");

        await this.appendChatHistory(userId, fileId, `AI: ${noContextMsg}`);
        await this.appendChatMessage(chatId, "ai", noContextMsg);
        return;
      }

      const context = await this.pineconeService.getContextWithSummarization(
        results
      );

      const chatHistory = await this.getChatHistory(userId, fileId);

      const fullPrompt = UserInputSchema.parse({
        question,
        chatHistory,
        context,
      });

      let fullAnswer = "";
      for await (const token of this.llmService.generateAnswerStream(
        fullPrompt
      )) {
        this.io.to(userId).emit("answer_chunk", { token });
        fullAnswer += token;
      }

      await this.appendChatHistory(userId, fileId, `AI: ${fullAnswer}`);
      await this.appendChatMessage(chatId, "ai", fullAnswer);
      await this.trimChatHistory(userId, fileId);

      this.io.to(userId).emit("answer_complete");
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        this.io.to(userId).emit("error", { message: "Something went wrong" });
      }
    }
  }

  private async appendChatHistory(
    userId: string,
    fileId: string,
    message: string
  ) {
    const key = `chat:${userId}:${fileId}`;
    // append message to redis list
    await redisChatHistory.rPush(key, message);
    // refresh expiry to 24 hours
    await redisChatHistory.expire(key, 60 * 60 * 24);
  }

  private async getChatHistory(
    userId: string,
    fileId: string
  ): Promise<string[]> {
    const key = `chat:${userId}:${fileId}`;
    return await redisChatHistory.lRange(key, 0, -1);
  }

  private async trimChatHistory(
    userId: string,
    fileId: string,
    maxEntries = 100
  ) {
    const key = `chat:${userId}:${fileId}`;
    await redisChatHistory.lTrim(key, -maxEntries, -1);
  }

  getServer(): http.Server {
    return this.server;
  }

  private async getOrCreateChat(
    userId: string,
    fileId?: string
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      "SELECT id FROM chats WHERE user_id=$1 AND file_id=$2 ORDER BY created_at DESC LIMIT 1",
      [userId, fileId ?? null]
    );

    if (result.rowCount! > 0) {
      return result.rows[0].id;
    }

    const insert = await this.db.query<{ id: string }>(
      "INSERT INTO chats(user_id, file_id) VALUES($1, $2) RETURNING id",
      [userId, fileId ?? null]
    );
    return insert.rows[0]!.id;
  }

  private async appendChatMessage(
    chatId: string,
    sender: "user" | "ai",
    message: string
  ) {
    await this.db.query(
      "INSERT INTO chat_messages(chat_id, sender, message) VALUES($1, $2, $3)",
      [chatId, sender, message]
    );
  }

  private initServices() {
    this.llmService = new LLMService();

    this.fetchHTMLService = new FetchHTMLService();
    this.deepResearchService = new DeepResearchService(this.llmService);

    this.pineconeService = new VectorStoreService(
      this.llmService,
      "pinecone",
      this.fetchHTMLService,
      this.deepResearchService
    );

    this.llmService.enrichmentService = new EnrichmentService(
      this.llmService,
      this.pineconeService,
      this.fetchHTMLService,
      this.deepResearchService
    );
  }
}
