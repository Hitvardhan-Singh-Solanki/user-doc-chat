import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import {
  rateLimit,
  authRateLimit,
  fileUploadRateLimit,
} from '../security.middleware';
import { rateLimiterService } from '../../../infrastructure/cache/rate-limiter.service';
import { logger } from '@config/logger.config';
import {
  MockRequest,
  MockResponse,
  MockNextFunction,
  RateLimitError,
  RedisConnectionError,
  MockRateLimiterService,
  TestLogger,
} from '../../types/test.types';

vi.mock('../../../infrastructure/cache/rate-limiter.service');
vi.mock('@config/logger.config', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockRateLimiterService =
  rateLimiterService as unknown as MockRateLimiterService;
const mockLogger = logger as unknown as TestLogger;

describe('Security Middleware', () => {
  let mockReq: MockRequest;
  let mockRes: MockResponse;
  let mockNext: MockNextFunction;

  beforeEach(() => {
    mockReq = {
      ip: '192.168.1.1',
      headers: { 'user-agent': 'test-agent' },
      path: '/test',
      method: 'GET',
    };

    mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn() as unknown as MockNextFunction;
    mockNext.called = false;

    vi.clearAllMocks();
  });

  describe('rateLimit', () => {
    it('should call next() when rate limit is not exceeded', async () => {
      mockRateLimiterService.consumeGeneral = vi
        .fn()
        .mockResolvedValue(undefined);
      mockRateLimiterService.getRateLimitInfo = vi.fn().mockResolvedValue({
        remainingPoints: 50,
        msBeforeNext: 1000,
      });

      rateLimit(mockReq as Request, mockRes as unknown as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '100',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '50',
      );
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const rateLimitError: RateLimitError = {
        remainingPoints: 0,
        msBeforeNext: 5000,
      };

      mockRateLimiterService.consumeGeneral = vi
        .fn()
        .mockRejectedValue(rateLimitError);

      rateLimit(mockReq as Request, mockRes as unknown as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        retryAfter: 5,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          remainingPoints: 0,
          msBeforeNext: 5000,
        }),
        'Rate limit exceeded',
      );
    });

    it('should call next() when Redis connection fails', async () => {
      const redisError: RedisConnectionError = new Error(
        'Redis connection failed',
      );
      redisError.code = 'ECONNREFUSED';

      mockRateLimiterService.consumeGeneral = vi
        .fn()
        .mockRejectedValue(redisError);

      rateLimit(mockReq as Request, mockRes as unknown as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          error: 'Redis connection failed',
        }),
        'Rate limiter Redis error, bypassing rate limit',
      );
    });
  });

  describe('authRateLimit', () => {
    it('should call next() when auth rate limit is not exceeded', async () => {
      mockRateLimiterService.consumeAuth = vi.fn().mockResolvedValue(undefined);
      mockRateLimiterService.getRateLimitInfo = vi.fn().mockResolvedValue({
        remainingPoints: 3,
        msBeforeNext: 1000,
      });

      authRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '3',
      );
    });

    it('should return 429 when auth rate limit is exceeded', async () => {
      const rateLimitError: RateLimitError = {
        remainingPoints: 0,
        msBeforeNext: 300000,
      };

      mockRateLimiterService.consumeAuth = vi
        .fn()
        .mockRejectedValue(rateLimitError);

      authRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many authentication attempts',
        retryAfter: 300,
      });
    });

    it('should call next() when Redis connection fails for auth', async () => {
      const redisError: RedisConnectionError = new Error('Redis timeout');
      redisError.code = 'ETIMEDOUT';

      mockRateLimiterService.consumeAuth = vi
        .fn()
        .mockRejectedValue(redisError);

      authRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          endpoint: '/test',
          error: 'Redis timeout',
        }),
        'Auth rate limiter Redis error, bypassing rate limit',
      );
    });
  });

  describe('fileUploadRateLimit', () => {
    it('should call next() when file upload rate limit is not exceeded', async () => {
      mockRateLimiterService.consumeFileUpload = vi
        .fn()
        .mockResolvedValue(undefined);
      mockRateLimiterService.getRateLimitInfo = vi.fn().mockResolvedValue({
        remainingPoints: 8,
        msBeforeNext: 1000,
      });

      fileUploadRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '8',
      );
    });

    it('should return 429 when file upload rate limit is exceeded', async () => {
      const rateLimitError: RateLimitError = {
        remainingPoints: 0,
        msBeforeNext: 1800000,
      };

      mockRateLimiterService.consumeFileUpload = vi
        .fn()
        .mockRejectedValue(rateLimitError);

      fileUploadRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many file uploads',
        retryAfter: 1800,
      });
    });

    it('should call next() when Redis connection fails for file upload', async () => {
      const redisError: RedisConnectionError = new Error(
        'Redis server unavailable',
      );
      redisError.code = 'ENOTFOUND';

      mockRateLimiterService.consumeFileUpload = vi
        .fn()
        .mockRejectedValue(redisError);

      fileUploadRateLimit(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          endpoint: '/test',
          error: 'Redis server unavailable',
        }),
        'File upload rate limiter Redis error, bypassing rate limit',
      );
    });
  });
});
