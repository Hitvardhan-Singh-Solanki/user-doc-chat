import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import { redisPub } from '../database/repositories/redis.repo';
import { logger } from '@config/logger.config';
import type { RateLimitInfo, RateLimiterTypeKey } from '@shared/types';

export class RateLimiterService {
  private generalLimiter?: RateLimiterRedis | RateLimiterMemory;
  private authLimiter?: RateLimiterRedis | RateLimiterMemory;
  private fileUploadLimiter?: RateLimiterRedis | RateLimiterMemory;
  private chatLimiter?: RateLimiterRedis | RateLimiterMemory;
  private isRedisConnected: boolean = false;
  private initPromise?: Promise<void>;

  constructor() {
    // Constructor for singleton
  }

  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeRateLimiters();
    }
    return this.initPromise;
  }

  async consumeGeneral(key: string): Promise<void> {
    if (!this.generalLimiter) {
      throw new Error('RateLimiterService not initialized');
    }
    await this.generalLimiter.consume(key);
  }

  async consumeAuth(key: string): Promise<void> {
    if (!this.authLimiter) {
      throw new Error('RateLimiterService not initialized');
    }
    await this.authLimiter.consume(key);
  }

  async consumeFileUpload(key: string): Promise<void> {
    if (!this.fileUploadLimiter) {
      throw new Error('RateLimiterService not initialized');
    }
    await this.fileUploadLimiter.consume(key);
  }

  async consumeChat(key: string): Promise<void> {
    if (!this.chatLimiter) {
      throw new Error('RateLimiterService not initialized');
    }
    await this.chatLimiter.consume(key);
  }

  async getRemainingPoints(
    key: string,
    type: RateLimiterTypeKey,
  ): Promise<number> {
    const limiter = this.getLimiter(type);
    if (!limiter) {
      throw new Error('RateLimiterService not initialized');
    }
    const resConsume = await limiter.get(key);
    return resConsume?.remainingPoints ?? Number(limiter.points);
  }

  async getTotalHits(key: string, type: RateLimiterTypeKey): Promise<number> {
    const limiter = this.getLimiter(type);
    if (!limiter) {
      throw new Error('RateLimiterService not initialized');
    }
    const resConsume = await limiter.get(key);
    return resConsume?.consumedPoints || 0;
  }

  async reset(key: string, type: RateLimiterTypeKey): Promise<void> {
    const limiter = this.getLimiter(type);
    if (!limiter) {
      throw new Error('RateLimiterService not initialized');
    }
    await limiter.delete(key);
    logger.info({ key, type }, 'Rate limit reset for key');
  }

  async getRateLimitInfo(
    key: string,
    type: RateLimiterTypeKey,
  ): Promise<RateLimitInfo> {
    const limiter = this.getLimiter(type);
    if (!limiter) {
      throw new Error('RateLimiterService not initialized');
    }

    const resConsume = await limiter.get(key);
    return this.buildRateLimitResponse(resConsume, limiter);
  }

  isRedisBackend(): boolean {
    return this.isRedisConnected;
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

  private getLimiter(
    type: 'general' | 'auth' | 'upload' | 'chat',
  ): RateLimiterRedis | RateLimiterMemory | undefined {
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

  private buildRateLimitResponse(
    resConsume: RateLimiterRes | null,
    limiter: { points: number },
  ) {
    const remainingPoints =
      resConsume?.remainingPoints ?? Number(limiter.points);
    const totalHits = resConsume?.consumedPoints || 0;
    const msBeforeNext = resConsume?.msBeforeNext || 0;
    const isBlocked = resConsume ? remainingPoints <= 0 : false;

    return {
      remainingPoints,
      totalHits,
      msBeforeNext,
      isBlocked,
    };
  }
}

// Factory function that ensures initialization
let rateLimiterInstance: RateLimiterService | null = null;
let initializationPromise: Promise<RateLimiterService> | null = null;

export async function getRateLimiterService(): Promise<RateLimiterService> {
  if (rateLimiterInstance) {
    return rateLimiterInstance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const instance = new RateLimiterService();
    await instance.initialize();
    rateLimiterInstance = instance;
    return instance;
  })();

  return initializationPromise;
}
