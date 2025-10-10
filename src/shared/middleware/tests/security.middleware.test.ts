import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import {
  rateLimit,
  authRateLimit,
  fileUploadRateLimit,
} from '../security.middleware';
import { rateLimiterService } from '@cache/rate-limiter.service';
import { logger } from '@config/logger.config';
import {
  MockRequest,
  MockResponse,
  MockNextFunction,
  RateLimitError,
  RateLimitErrorImpl,
  RedisConnectionError,
  MockRateLimiterService,
  TestLogger,
} from '@shared/types/test.types';

vi.mock('@cache/rate-limiter.service');
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
      const rateLimitError = new RateLimitErrorImpl(0, 5000);

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
      const redisError = new RedisConnectionError('Redis connection failed');

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
        'Rate limiter service error, using in-memory fallback',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          remaining: expect.any(Number),
        }),
        'Request allowed via in-memory fallback rate limiter',
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
      const rateLimitError = new RateLimitErrorImpl(0, 300000);

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
      const redisError = new RedisConnectionError('Redis timeout');

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
        'Auth rate limiter service error, using in-memory fallback',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          endpoint: '/test',
          remaining: expect.any(Number),
        }),
        'Auth request allowed via in-memory fallback rate limiter',
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
      const rateLimitError = new RateLimitErrorImpl(0, 1800000);

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
      const redisError = new RedisConnectionError('Redis server unavailable');

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
        'File upload rate limiter service error, using in-memory fallback',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          endpoint: '/test',
        }),
        'File upload allowed via in-memory fallback rate limiter',
      );
    });

    it('should block file uploads when in-memory fallback limit is exceeded', async () => {
      const mockReq = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'test-agent' },
        path: '/test',
      } as Request;
      const mockNext = vi.fn();

      // Mock Redis failure
      vi.spyOn(rateLimiterService, 'consumeFileUpload').mockRejectedValue(
        new Error('Redis server unavailable'),
      );

      // Simulate multiple requests to exceed the in-memory limit (5 attempts)
      let blockedRequest = false;
      for (let i = 0; i < 6; i++) {
        const mockRes = {
          setHeader: vi.fn(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;

        fileUploadRateLimit(mockReq, mockRes, mockNext);
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Check if this request was blocked
        if (
          (mockRes.status as unknown as { mock: { calls: number[][] } }).mock
            .calls.length > 0 &&
          (mockRes.status as unknown as { mock: { calls: number[][] } }).mock
            .calls[0][0] === 429
        ) {
          blockedRequest = true;
          expect(mockRes.json).toHaveBeenCalledWith({
            error: 'Too many file uploads (fallback protection)',
            retryAfter: 60,
          });
          break;
        }
      }

      expect(blockedRequest).toBe(true);
    });
  });
});
