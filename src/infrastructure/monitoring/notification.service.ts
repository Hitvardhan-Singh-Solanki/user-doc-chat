import { Client, SSEData } from '../../shared/types';
import { redisPub, redisSub } from '../database/repositories/redis.repo';
import { logger } from '../../config/logger.config';

class SSEEmitter {
  private clients: Map<string, Client[]> = new Map();
  private readonly log = logger.child({ component: 'SSEEmitter' });

  constructor() {
    const subscribe = async () => {
      try {
        await redisSub.subscribe('sse-events', (message: string) => {
          try {
            const { userId, event, data } = JSON.parse(message);
            this.sendLocal(userId, event, data);
            this.log.debug(
              { userId, event },
              'Successfully processed SSE Redis message.',
            );
          } catch (err) {
            this.log.error(
              { err: (err as Error).message, message },
              'Failed to parse SSE Redis message.',
            );
          }
        });
        this.log.info('SSEEmitter: subscribed to sse-events channel.');
      } catch (err) {
        this.log.error(
          { err: (err as Error).message },
          'SSEEmitter: failed to subscribe to sse-events channel.',
        );
      }
    };
    // Subscribe when the Redis sub client is ready
    if ((redisSub as any).isOpen) {
      void subscribe();
    } else {
      this.log.info('Waiting for Redis subscriber to be ready...');
      redisSub.once('ready', () => void subscribe());
    }
  }

  /** Add new SSE connection for a user */
  addClient(userId: string, res: any) {
    this.log.info({ userId }, 'Adding new client to SSE emitter.');
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
      this.log.debug({ userId }, 'Created new client array for user.');
    }
    this.clients.get(userId)!.push({ res });
  }

  /** Remove SSE connection for a user */
  removeClient(userId: string, res: any) {
    this.log.info({ userId }, 'Removing client from SSE emitter.');
    const arr = this.clients.get(userId) || [];
    this.clients.set(
      userId,
      arr.filter((c) => c.res !== res),
    );
  }

  /** Send message to all Node instances (publishes to Redis) */
  send(userId: string, event: string, data: SSEData) {
    this.log.info(
      { userId, event, data },
      'Publishing message to Redis for all SSE instances.',
    );
    redisPub.publish('sse-events', JSON.stringify({ userId, event, data }));
  }

  /** Send message to only local clients connected to this Node */
  private sendLocal(userId: string, event: string, data: SSEData) {
    this.log.debug({ userId, event }, 'Sending message to local SSE clients.');
    const arr = this.clients.get(userId) || [];
    this.clients.set(
      userId,
      arr.filter(({ res }) => {
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          return true;
        } catch (err) {
          this.log.error(
            { userId, err: (err as Error).message },
            'Failed to write to client response stream. Removing client.',
          );
          return false;
        }
      }),
    );
  }
}

export const sseEmitter = new SSEEmitter();
