import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redisPub } from '../database/repositories/redis.repo';
import { logger } from '@config/logger.config';

export class RateLimiterService {
  private generalLimiter: RateLimiterRedis;
  private authLimiter: RateLimiterRedis;
  private fileUploadLimiter: RateLimiterRedis;
  private chatLimiter: RateLimiterRedis;

  constructor() {
    // General rate limiter: 100 requests per 15 minutes (900 seconds)
    this.generalLimiter = new RateLimiterRedis({
      storeClient: redisPub,
      keyPrefix: 'rl_general',
      points: 100,
      duration: 900, // 15 minutes
      blockDuration: 60, // 1 minute block after exceeding
    });

    // Auth rate limiter: 5 attempts per 15 minutes (900 seconds)
    this.authLimiter = new RateLimiterRedis({
      storeClient: redisPub,
      keyPrefix: 'rl_auth',
      points: 5,
      duration: 900, // 15 minutes
      blockDuration: 300, // 5 minutes block after exceeding
    });

    // File upload rate limiter: 10 uploads per hour (3600 seconds)
    this.fileUploadLimiter = new RateLimiterRedis({
      storeClient: redisPub,
      keyPrefix: 'rl_upload',
      points: 10,
      duration: 3600, // 1 hour
      blockDuration: 1800, // 30 minutes block after exceeding
    });

    // Chat rate limiter: 200 messages per hour (3600 seconds)
    this.chatLimiter = new RateLimiterRedis({
      storeClient: redisPub,
      keyPrefix: 'rl_chat',
      points: 200,
      duration: 3600, // 1 hour
      blockDuration: 300, // 5 minutes block after exceeding
    });
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
    return resConsume?.remainingPoints || 0;
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
  ): RateLimiterRedis {
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

    return {
      remainingPoints: resConsume?.remainingPoints || 0,
      totalHits: resConsume?.consumedPoints || 0,
      msBeforeNext: resConsume?.msBeforeNext || 0,
      isBlocked:
        resConsume?.isFirstInDuration === false &&
        resConsume?.remainingPoints === 0,
    };
  }
}

export const rateLimiterService = new RateLimiterService();
