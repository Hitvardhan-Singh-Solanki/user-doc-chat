import { Request, Response, NextFunction } from 'express';
import { logger } from '@config/logger.config';
import { rateLimiterService } from '@cache/rate-limiter.service';
import { config } from '@config';

/**
 * In-memory fallback rate limiter for file uploads
 * Provides basic protection when Redis is unavailable
 */
class InMemoryFileUploadLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> =
    new Map();
  private readonly maxAttempts = 5; // Conservative limit for fallback
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes

  isBlocked(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetTime) {
      // Reset or initialize
      this.attempts.set(key, { count: 1, resetTime: now + this.windowMs });
      return false;
    }

    if (record.count >= this.maxAttempts) {
      return true;
    }

    // Increment count
    record.count++;
    return false;
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      if (now > record.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}

// Global in-memory fallback limiter
const inMemoryFileUploadLimiter = new InMemoryFileUploadLimiter();

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    inMemoryFileUploadLimiter.cleanup();
  },
  5 * 60 * 1000,
);

/**
 * Security middleware for Express application
 * Implements comprehensive security headers and protections
 */

/**
 * Sets security headers to protect against common web vulnerabilities
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Frame-Options', 'DENY');

  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  );

  res.removeHeader('X-Powered-By');

  next();
}

/**
 * Helper function to set Vary: Origin header
 */
function setVaryOrigin(res: Response): void {
  const existingVary = res.getHeader('Vary');
  if (existingVary) {
    const varyArray = Array.isArray(existingVary)
      ? existingVary
      : [existingVary];
    if (!varyArray.includes('Origin')) {
      res.setHeader('Vary', [...varyArray, 'Origin'].join(', '));
    }
  } else {
    res.setHeader('Vary', 'Origin');
  }
}

/**
 * CORS configuration with security considerations
 */
export function corsSecurity(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  const allowedOrigins = config.CORS_ORIGINS;

  // Allow requests with no Origin header (same-origin, CLI, health checks)
  if (!origin) {
    if (req.method === 'OPTIONS') {
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With',
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      setVaryOrigin(res);
      res.status(204).end();
      return;
    }
    next();
    return;
  }

  if (req.method === 'OPTIONS') {
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (config.NODE_ENV === 'development') {
      if (
        origin?.startsWith('http://localhost') ||
        origin?.startsWith('http://127.0.0.1')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        logger.warn({ origin, ip: req.ip }, 'Blocked origin in development');
        res.status(403).json({ error: 'Origin not allowed' });
        return;
      }
    } else {
      logger.warn(
        { origin, ip: req.ip },
        'Blocked unauthorized origin in OPTIONS',
      );
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    setVaryOrigin(res);
    res.status(204).end();
    return;
  }

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    setVaryOrigin(res);
  } else if (config.NODE_ENV === 'development') {
    if (
      origin?.startsWith('http://localhost') ||
      origin?.startsWith('http://127.0.0.1')
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      setVaryOrigin(res);
    } else {
      logger.warn({ origin, ip: req.ip }, 'Blocked origin in development');
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
  } else {
    logger.warn({ origin, ip: req.ip }, 'Blocked unauthorized origin');
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  next();
}

/**
 * Request size limiting middleware
 */
export function requestSizeLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const maxSize = config.MAX_FILE_SIZE;
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  if (contentLength > maxSize) {
    logger.warn(
      {
        contentLength,
        maxSize,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      'Request size limit exceeded',
    );

    res.status(413).json({ error: 'Request entity too large' });
    return;
  }

  next();
}

/**
 * Rate limiting middleware using Redis-based rate-limiter-flexible
 */
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip || 'unknown';

  rateLimiterService
    .consumeGeneral(key)
    .then(async () => {
      const rateLimitInfo = await rateLimiterService.getRateLimitInfo(
        key,
        'general',
      );

      res.setHeader('X-RateLimit-Limit', '100');
      res.setHeader(
        'X-RateLimit-Remaining',
        rateLimitInfo.remainingPoints.toString(),
      );
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + rateLimitInfo.msBeforeNext).toISOString(),
      );

      next();
    })
    .catch((error) => {
      // Handle rate limit exceeded (RateLimitError)
      if (
        error.remainingPoints !== undefined &&
        error.msBeforeNext !== undefined
      ) {
        logger.warn(
          {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            remainingPoints: error.remainingPoints,
            msBeforeNext: error.msBeforeNext,
          },
          'Rate limit exceeded',
        );

        res.setHeader('X-RateLimit-Limit', '100');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(Date.now() + error.msBeforeNext).toISOString(),
        );

        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(error.msBeforeNext / 1000),
        });
        return;
      }

      // Handle Redis connection errors or other service failures
      logger.error(
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          error: error.message,
          errorName: error.name,
        },
        'Rate limiter service error, bypassing rate limit',
      );

      // Fail-open strategy: allow access when rate limiter is unavailable
      next();
    });
}

/**
 * Auth-specific rate limiting middleware (stricter limits)
 */
export function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip || 'unknown';

  rateLimiterService
    .consumeAuth(key)
    .then(async () => {
      const rateLimitInfo = await rateLimiterService.getRateLimitInfo(
        key,
        'auth',
      );

      res.setHeader('X-RateLimit-Limit', '5');
      res.setHeader(
        'X-RateLimit-Remaining',
        rateLimitInfo.remainingPoints.toString(),
      );
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + rateLimitInfo.msBeforeNext).toISOString(),
      );

      next();
    })
    .catch((error) => {
      // Handle rate limit exceeded (RateLimitError)
      if (
        error.remainingPoints !== undefined &&
        error.msBeforeNext !== undefined
      ) {
        logger.warn(
          {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            remainingPoints: error.remainingPoints,
            msBeforeNext: error.msBeforeNext,
          },
          'Auth rate limit exceeded',
        );

        res.setHeader('X-RateLimit-Limit', '5');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(Date.now() + error.msBeforeNext).toISOString(),
        );

        res.status(429).json({
          error: 'Too many authentication attempts',
          retryAfter: Math.ceil(error.msBeforeNext / 1000),
        });
        return;
      }

      // Handle Redis connection errors or other service failures
      logger.error(
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          error: error.message,
          errorName: error.name,
        },
        'Auth rate limiter service error, bypassing rate limit',
      );

      // Fail-open strategy: allow access when rate limiter is unavailable
      next();
    });
}

/**
 * File upload rate limiting middleware
 */
export function fileUploadRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.ip || 'unknown';

  rateLimiterService
    .consumeFileUpload(key)
    .then(async () => {
      const rateLimitInfo = await rateLimiterService.getRateLimitInfo(
        key,
        'upload',
      );

      res.setHeader('X-RateLimit-Limit', '10');
      res.setHeader(
        'X-RateLimit-Remaining',
        rateLimitInfo.remainingPoints.toString(),
      );
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + rateLimitInfo.msBeforeNext).toISOString(),
      );

      next();
    })
    .catch((error) => {
      // Handle rate limit exceeded (RateLimitError)
      if (
        error.remainingPoints !== undefined &&
        error.msBeforeNext !== undefined
      ) {
        logger.warn(
          {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            remainingPoints: error.remainingPoints,
            msBeforeNext: error.msBeforeNext,
          },
          'File upload rate limit exceeded',
        );

        res.setHeader('X-RateLimit-Limit', '10');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(Date.now() + error.msBeforeNext).toISOString(),
        );

        res.status(429).json({
          error: 'Too many file uploads',
          retryAfter: Math.ceil(error.msBeforeNext / 1000),
        });
        return;
      }

      // Handle Redis connection errors or other service failures
      logger.error(
        {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
          error: error.message,
          errorName: error.name,
        },
        'File upload rate limiter service error, using in-memory fallback',
      );

      // Fail-closed strategy: use in-memory fallback for file uploads
      // File uploads are resource-intensive and need protection even during Redis outages
      if (inMemoryFileUploadLimiter.isBlocked(key)) {
        logger.warn(
          {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
          },
          'File upload blocked by in-memory fallback rate limiter',
        );

        res.setHeader('X-RateLimit-Limit', '10');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader(
          'X-RateLimit-Reset',
          new Date(Date.now() + 60000).toISOString(), // 1 minute fallback
        );

        res.status(429).json({
          error: 'Too many file uploads (fallback protection)',
          retryAfter: 60,
        });
        return;
      }

      // Allow the request but log that we're using fallback protection
      logger.info(
        {
          ip: req.ip,
          endpoint: req.path,
        },
        'File upload allowed via in-memory fallback rate limiter',
      );

      res.setHeader('X-RateLimit-Limit', '10');
      res.setHeader('X-RateLimit-Remaining', '9'); // Conservative estimate
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + 60000).toISOString(),
      );

      next();
    });
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  next();
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: Record<string, unknown>): void {
  if (typeof obj !== 'object' || obj === null) return;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key] as Record<string, unknown>);
      }
    }
  }
}

/**
 * Security logging middleware
 */
export function securityLogging(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  const securityInfo = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  };

  const suspiciousPatterns = [
    /\.\./,
    /<script/i,
    /union.*select/i,
    /javascript:/i,
    /eval\(/i,
  ];

  const requestString = `${req.method} ${req.url} ${JSON.stringify(req.body)}`;
  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(requestString),
  );

  if (isSuspicious) {
    logger.warn(
      {
        ...securityInfo,
        suspicious: true,
      },
      'Suspicious request detected',
    );
  }

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;

    logger.info(
      {
        ...securityInfo,
        statusCode: res.statusCode,
        responseTime,
      },
      'Request completed',
    );
  });

  next();
}

/**
 * Error handling middleware that prevents information disclosure
 */
export function secureErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const isProduction = config.NODE_ENV === 'production';

  // Log the full error for debugging
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    },
    'Unhandled error caught by middleware',
  );

  if (isProduction) {
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }
}
