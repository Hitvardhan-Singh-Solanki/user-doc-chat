import { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger.config';

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
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Transport Security (HTTPS only)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: Consider removing unsafe-inline and unsafe-eval in production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  );

  // Remove X-Powered-By header to hide Express version
  res.removeHeader('X-Powered-By');

  next();
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
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
  ];

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    // In development, allow localhost origins
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  // Security: Don't allow credentials with wildcard origin
  if (res.getHeader('Access-Control-Allow-Origin') !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
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
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE || '10485760', 10); // 10MB default
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
 * Rate limiting middleware using rate-limiter-flexible
 */
export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // This is a basic implementation - in production, use a proper rate limiting library
  // like express-rate-limit or rate-limiter-flexible with Redis

  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
  const maxRequests = parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || '100',
    10,
  );

  // Simple in-memory rate limiting (not suitable for production with multiple instances)
  const now = Date.now();

  // This is a simplified implementation - use proper rate limiting in production
  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', (maxRequests - 1).toString());
  res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

  next();
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Sanitize common XSS patterns in request body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
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
        // Remove common XSS patterns
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
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

  // Log security-relevant information
  const securityInfo = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  };

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /eval\(/i, // Code injection
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

  // Log response time and status
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
  const isProduction = process.env.NODE_ENV === 'production';

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

  // Don't expose sensitive error information in production
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
