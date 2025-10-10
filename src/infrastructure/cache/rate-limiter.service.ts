import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { redisPub } from '../database/repositories/redis.repo';
import { logger } from '@config/logger.config';

export class RateLimiterService {
  private generalLimiter!: RateLimiterRedis | RateLimiterMemory;
  private authLimiter!: RateLimiterRedis | RateLimiterMemory;
  private fileUploadLimiter!: RateLimiterRedis | RateLimiterMemory;
  private chatLimiter!: RateLimiterRedis | RateLimiterMemory;
  private isRedisConnected: boolean = false;

  constructor() {
    this.initializeRateLimiters();
  }

  private async checkRedisConnection(): Promise<boolean> {
    try {
      if (!redisPub || !redisPub.isReady) {
        logger.warn('Redis client is not ready or not initialized');
        return false;
      }

      await redisPub.ping();
      return true;
    } catch (error) {
      logger.error({ error }, 'Redis connection check failed');
      return false;
    }
  }

  private createMemoryLimiter(
    keyPrefix: string,
    points: number,
    duration: number,
    blockDuration: number,
  ): RateLimiterMemory {
    return new RateLimiterMemory({
      keyPrefix,
      points,
      duration,
      blockDuration,
    });
  }

  private async initializeRateLimiters(): Promise<void> {
    try {
      const isConnected = await this.checkRedisConnection();

      if (!isConnected) {
        throw new Error('Redis connection is not available');
      }

      this.isRedisConnected = true;

      this.generalLimiter = new RateLimiterRedis({
        storeClient: redisPub,
        keyPrefix: 'rl_general',
        points: 100,
        duration: 900, // 15 minutes
        blockDuration: 60, // 1 minute block after exceeding
      });

      this.authLimiter = new RateLimiterRedis({
        storeClient: redisPub,
        keyPrefix: 'rl_auth',
        points: 5,
        duration: 900, // 15 minutes
        blockDuration: 300, // 5 minutes block after exceeding
      });

      this.fileUploadLimiter = new RateLimiterRedis({
        storeClient: redisPub,
        keyPrefix: 'rl_upload',
        points: 10,
        duration: 3600, // 1 hour
        blockDuration: 1800, // 30 minutes block after exceeding
      });

      this.chatLimiter = new RateLimiterRedis({
        storeClient: redisPub,
        keyPrefix: 'rl_chat',
        points: 200,
        duration: 3600, // 1 hour
        blockDuration: 300, // 5 minutes block after exceeding
      });

      logger.info('Rate limiters initialized successfully with Redis backend');
    } catch (error) {
      logger.error(
        { error, context: 'rate-limiter-initialization' },
        'Failed to initialize Redis-based rate limiters, falling back to in-memory limiters',
      );

      this.isRedisConnected = false;

      this.generalLimiter = this.createMemoryLimiter(
        'rl_general',
        100,
        900,
        60,
      );

      this.authLimiter = this.createMemoryLimiter('rl_auth', 5, 900, 300);

      this.fileUploadLimiter = this.createMemoryLimiter(
        'rl_upload',
        10,
        3600,
        1800,
      );

      this.chatLimiter = this.createMemoryLimiter('rl_chat', 200, 3600, 300);

      logger.warn(
        'Rate limiters initialized with in-memory fallback - Redis unavailable',
      );
    }
  }

  async consumeGeneral(key: string): Promise<void> {
    await this.generalLimiter.consume(key);
  }

  async consumeAuth(key: string): Promise<void> {
    await this.authLimiter.consume(key);
  }

  async consumeFileUpload(key: string): Promise<void> {
    await this.fileUploadLimiter.consume(key);
  }

  async consumeChat(key: string): Promise<void> {
    await this.chatLimiter.consume(key);
  }

  async getRemainingPoints(
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ): Promise<number> {
    const limiter = this.getLimiter(type);
    const resConsume = await limiter.get(key);
    return resConsume?.remainingPoints ?? Number(limiter.points);
  }

  async getTotalHits(
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ): Promise<number> {
    const limiter = this.getLimiter(type);
    const resConsume = await limiter.get(key);
    return resConsume?.consumedPoints || 0;
  }

  private getLimiter(
    type: 'general' | 'auth' | 'upload' | 'chat',
  ): RateLimiterRedis | RateLimiterMemory {
    switch (type) {
      case 'general':
        return this.generalLimiter;
      case 'auth':
        return this.authLimiter;
      case 'upload':
        return this.fileUploadLimiter;
      case 'chat':
        return this.chatLimiter;
      default:
        return this.generalLimiter;
    }
  }

  async reset(
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ): Promise<void> {
    const limiter = this.getLimiter(type);
    await limiter.delete(key);
    logger.info({ key, type }, 'Rate limit reset for key');
  }

  async getRateLimitInfo(
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ) {
    const limiter = this.getLimiter(type);
    const resConsume = await limiter.get(key);
    const remainingPoints = resConsume?.remainingPoints ?? 0;

    return {
      remainingPoints: remainingPoints,
      totalHits: resConsume?.consumedPoints || 0,
      msBeforeNext: resConsume?.msBeforeNext || 0,
      isBlocked: resConsume ? remainingPoints <= 0 : false,
    };
  }

  isRedisBackend(): boolean {
    return this.isRedisConnected;
  }
}

export const rateLimiterService = new RateLimiterService();
