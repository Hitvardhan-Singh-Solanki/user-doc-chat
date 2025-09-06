import http from "http";
import { Express } from "express";
import { Server } from "socket.io";
import { verifyJwt } from "../utils/jwt";
import { LLMService } from "./llm.service";
import { PineconeService } from "./pinecone.service";
import { redisChatHistory } from "../repos/redis.repo";

export class SocketIOService {
  private static instance: SocketIOService;
  public io: Server;
  private server: http.Server;
  private llmmService: LLMService;
  private pineconeService: PineconeService;

  private constructor(app: Express) {
    this.server = http.createServer(app);

    this.io = new Server(this.server, {
      cors: {
        origin: "*", //TODO: replace with frontend URL in prod
        methods: ["GET", "POST"],
      },
    });

    this.llmmService = new LLMService();
    this.pineconeService = new PineconeService();

    this.authVerification();
    this.onConnection();
  }

  public static getInstance(app: Express): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService(app);
    }
    return SocketIOService.instance;
  }

  authVerification() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      try {
        const decoded = verifyJwt(token);
        (socket as any).userId = (decoded as any).userId;
        next();
      } catch (err) {
        next(new Error("Invalid token"));
      }
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
    const qEmbedding = await this.llmmService.embeddingPython(question);
    const results = await this.pineconeService.query(
      qEmbedding,
      userId,
      fileId
    );

    if (!results.matches.length) {
      this.io.to(userId).emit("answer_chunk", {
        token: "No relevant context found. I don't know the answer.",
      });
      this.io.to(userId).emit("answer_complete");
      return;
    }

    const context = await this.pineconeService.getContextWithSummarization(
      results
    );

    const chatHistory = await this.getChatHistory(userId, fileId);

    const prompt = this.llmmService.buildPrompt(context, question, chatHistory);

    for await (const token of this.llmmService.generateAnswerStream(prompt)) {
      this.io.to(userId).emit("answer_chunk", { token });
      await this.appendChatHistory(userId, fileId, `AI: ${token}`);
    }

    await this.appendChatHistory(userId, fileId, `User: ${question}`);
    await this.trimChatHistory(userId, fileId);

    this.io.to(userId).emit("answer_complete");
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
}
