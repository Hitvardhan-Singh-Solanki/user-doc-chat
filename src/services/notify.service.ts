import { Client, SSEData } from "../types";
import { redisPub, redisSub } from "../repos/redis.repo";

class SSEEmitter {
  private clients: Map<string, Client[]> = new Map();

class SSEEmitter {
  private clients: Map<string, Client[]> = new Map();

  constructor() {
    const subscribe = async () => {
      try {
        await redisSub.subscribe("sse-events", (message: string) => {
          try {
            const { userId, event, data } = JSON.parse(message);
            this.sendLocal(userId, event, data);
          } catch (err) {
            console.error("Failed to parse SSE Redis message", err);
          }
        });
        console.log("SSEEmitter: subscribed to sse-events");
      } catch (err) {
        console.error("SSEEmitter: failed to subscribe to sse-events", err);
      }
    };
    // Subscribe when the Redis sub client is ready
    if ((redisSub as any).isOpen) {
      void subscribe();
    } else {
      redisSub.once("ready", () => void subscribe());
    }
  }
}

  /** Add new SSE connection for a user */
  addClient(userId: string, res: any) {
    if (!this.clients.has(userId)) this.clients.set(userId, []);
    this.clients.get(userId)!.push({ res });
  }

  /** Remove SSE connection for a user */
  removeClient(userId: string, res: any) {
    const arr = this.clients.get(userId) || [];
    this.clients.set(
      userId,
      arr.filter((c) => c.res !== res)
    );
  }

  /** Send message to all Node instances (publishes to Redis) */
  send(userId: string, event: string, data: SSEData) {
    redisPub.publish("sse-events", JSON.stringify({ userId, event, data }));
  }

  /** Send message to only local clients connected to this Node */
  private sendLocal(userId: string, event: string, data: SSEData) {
    const arr = this.clients.get(userId) || [];
    this.clients.set(
      userId,
      arr.filter(({ res }) => {
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          return true;
        } catch {
          return false;
        }
      })
    );
  }
}

export const sseEmitter = new SSEEmitter();
