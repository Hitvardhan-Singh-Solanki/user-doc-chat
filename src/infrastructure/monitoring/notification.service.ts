import { Response } from 'express';
import { Client, SSEData } from '../../shared/types';
import { redisPub, redisSub } from '../database/repositories/redis.repo';
import { logger } from '../../config/logger.config';

class SSEEmitter {
  private clients: Map<string, Client[]> = new Map();
  private readonly log = logger.child({ component: 'SSEEmitter' });
  private isInitialized = false;
  private retryCount = 0;
  private readonly maxRetries = 5;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      await this.subscribe();
      this.isInitialized = true;
      this.retryCount = 0;
    } catch (err) {
      this.log.error(
        { err: (err as Error).message, retryCount: this.retryCount },
        'SSEEmitter: failed to initialize subscription.',
      );
      await this.handleSubscriptionFailure();
    }
  }

  private async isRedisClientReady(client: typeof redisSub): Promise<boolean> {
    try {
      // Check if client is ready using the isReady property
      if (client.isReady) {
        return true;
      }

      // Perform explicit health check with ping
      await client.ping();
      return true;
    } catch (error) {
      this.log.debug(
        { error: (error as Error).message, isReady: client.isReady },
        'Redis client health check failed',
      );
      return false;
    }
  }

  private async subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      const subscribeHandler = async () => {
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
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      // Check Redis client readiness with proper type checking
      this.isRedisClientReady(redisSub)
        .then((isReady) => {
          if (isReady) {
            subscribeHandler();
          } else {
            this.log.info('Waiting for Redis subscriber to be ready...');
            redisSub.once('ready', subscribeHandler);
          }
        })
        .catch((error) => {
          this.log.error(
            { error: (error as Error).message },
            'Failed to check Redis client readiness',
          );
          reject(error);
        });
    });
  }

  private async handleSubscriptionFailure(): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      this.log.error(
        { maxRetries: this.maxRetries },
        'SSEEmitter: max retry attempts reached. Subscription failed permanently.',
      );
      return;
    }

    this.retryCount++;
    const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff

    this.log.warn(
      { retryCount: this.retryCount, delayMs: delay },
      'SSEEmitter: retrying subscription after delay.',
    );

    setTimeout(async () => {
      try {
        await this.subscribe();
        this.isInitialized = true;
        this.retryCount = 0;
        this.log.info('SSEEmitter: subscription recovered after retry.');
      } catch (err) {
        this.log.error(
          { err: (err as Error).message, retryCount: this.retryCount },
          'SSEEmitter: retry attempt failed.',
        );
        await this.handleSubscriptionFailure();
      }
    }, delay);
  }

  /** Add new SSE connection for a user */
  addClient(userId: string, res: Response) {
    this.log.info({ userId }, 'Adding new client to SSE emitter.');
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
      this.log.debug({ userId }, 'Created new client array for user.');
    }
    this.clients.get(userId)!.push({ res });
  }

  /** Remove SSE connection for a user */
  removeClient(userId: string, res: Response) {
    this.log.info({ userId }, 'Removing client from SSE emitter.');
    const arr = this.clients.get(userId) || [];
    const filtered = arr.filter((c) => c.res !== res);

    if (filtered.length === 0) {
      this.clients.delete(userId);
      this.log.debug(
        { userId },
        'Removed user entry from clients Map (no remaining connections).',
      );
    } else {
      this.clients.set(userId, filtered);
    }
  }

  /** Send message to all Node instances (publishes to Redis) */
  async send(userId: string, event: string, data: SSEData): Promise<boolean> {
    this.log.info(
      { userId, event, data },
      'Publishing message to Redis for all SSE instances.',
    );

    try {
      const result = await redisPub.publish(
        'sse-events',
        JSON.stringify({ userId, event, data }),
      );
      this.log.debug(
        { userId, event, result },
        'Successfully published message to Redis.',
      );
      return true;
    } catch (error) {
      this.log.error(
        {
          userId,
          event,
          data,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        'Failed to publish message to Redis. Falling back to local delivery.',
      );

      // Fallback: send to local clients only
      try {
        this.sendLocal(userId, event, data);
        this.log.warn(
          { userId, event },
          'Message delivered locally as fallback after Redis publish failure.',
        );
        return false; // Indicate partial success (local only)
      } catch (fallbackError) {
        this.log.error(
          {
            userId,
            event,
            fallbackError: (fallbackError as Error).message,
          },
          'Both Redis publish and local fallback failed.',
        );
        throw new Error(
          `Failed to deliver message: Redis error - ${(error as Error).message}, Local fallback error - ${(fallbackError as Error).message}`,
        );
      }
    }
  }

  /** Send message to only local clients connected to this Node */
  private sendLocal(userId: string, event: string, data: SSEData) {
    this.log.debug({ userId, event }, 'Sending message to local SSE clients.');
    const arr = this.clients.get(userId) || [];

    // Create shallow copy to avoid race conditions during iteration
    const clientsToProcess = [...arr];
    const clientsToRemove: Client[] = [];
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const client of clientsToProcess) {
      const { res } = client;

      // Check if stream is still writable
      if (!res.writable || res.destroyed) {
        this.log.debug(
          { userId },
          'Client stream is not writable, marking for removal.',
        );
        clientsToRemove.push(client);
        continue;
      }

      try {
        // Attempt to write the message
        const writeSuccess = res.write(message);

        if (!writeSuccess) {
          // Stream is backpressured, queue the message
          this.log.debug(
            { userId },
            'Client stream is backpressured, queuing message.',
          );

          // Initialize queue if it doesn't exist
          if (!client.queue) {
            client.queue = [];
          }
          client.queue.push(message);

          // Only set up handlers if not already present
          if (!client.hasDrainHandler) {
            client.hasDrainHandler = true;

            const drainHandler = () => {
              this.log.debug(
                { userId },
                'Client stream drained, flushing queue.',
              );

              // Flush queued messages
              if (client.queue && client.queue.length > 0) {
                while (client.queue.length > 0) {
                  const queuedMessage = client.queue.shift()!;
                  const writeSuccess = res.write(queuedMessage);

                  if (!writeSuccess) {
                    // Still backpressured, stop flushing
                    break;
                  }
                }
              }

              // Clean up handlers
              client.hasDrainHandler = false;
              res.removeListener('drain', drainHandler);
              res.removeListener('error', errorHandler);
              res.removeListener('close', closeHandler);
            };

            const errorHandler = (err: Error) => {
              this.log.error(
                { userId, err: err.message },
                'Client stream error during drain wait, clearing queue and marking for removal.',
              );

              // Clear queue and clean up
              client.queue = [];
              client.hasDrainHandler = false;
              res.removeListener('drain', drainHandler);
              res.removeListener('error', errorHandler);
              res.removeListener('close', closeHandler);
              clientsToRemove.push(client);
            };

            const closeHandler = () => {
              this.log.debug(
                { userId },
                'Client stream closed during drain wait, clearing queue and marking for removal.',
              );

              // Clear queue and clean up
              client.queue = [];
              client.hasDrainHandler = false;
              res.removeListener('drain', drainHandler);
              res.removeListener('error', errorHandler);
              res.removeListener('close', closeHandler);
              clientsToRemove.push(client);
            };

            res.once('drain', drainHandler);
            res.once('error', errorHandler);
            res.once('close', closeHandler);
          }
        }
      } catch (err) {
        this.log.error(
          { userId, err: (err as Error).message },
          'Failed to write to client response stream. Marking for removal.',
        );
        clientsToRemove.push(client);
      }
    }

    // Remove clients that are no longer writable or had errors
    if (clientsToRemove.length > 0) {
      const remainingClients = arr.filter(
        (client) => !clientsToRemove.includes(client),
      );

      if (remainingClients.length === 0) {
        this.clients.delete(userId);
        this.log.debug(
          {
            userId,
            removedCount: clientsToRemove.length,
          },
          'Removed clients that are no longer writable. Deleted user entry (no remaining connections).',
        );
      } else {
        this.clients.set(userId, remainingClients);
        this.log.debug(
          {
            userId,
            removedCount: clientsToRemove.length,
            remainingCount: remainingClients.length,
          },
          'Removed clients that are no longer writable.',
        );
      }
    }
  }
}

export const sseEmitter = new SSEEmitter();
