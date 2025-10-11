import { expressjwt, UnauthorizedError } from 'express-jwt';
import { Request, Response, NextFunction } from 'express';
import { config } from '@config';
import { secretsManager } from '@secrets';

/**
 * Validates and returns JWT secret from environment variables
 * @throws {Error} When JWT_SECRET is missing, empty, or doesn't meet security requirements
 */
function validateJwtSecret(): string {
  const jwtSecret = secretsManager.getJwtSecret();

  if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error(
      'JWT_SECRET environment variable is required and must be non-empty. ' +
        'Please set JWT_SECRET in your environment configuration.',
    );
  }

  const trimmedSecret = jwtSecret.trim();

  // Security validation: minimum length check (256 bits = 32 bytes = 44 base64 chars)
  if (trimmedSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long (256 bits). ' +
        'Use: openssl rand -base64 32 to generate a secure secret.',
    );
  }

  // Security validation: check for common weak secrets
  const weakSecrets = [
    'secret',
    'password',
    '123456',
    'jwt-secret',
    'your-secret-here',
    'change-me',
    'default-secret',
    'test-secret',
    'development-secret',
    'production-secret',
  ];

  if (
    weakSecrets.some((weak) =>
      trimmedSecret.toLowerCase().includes(weak.toLowerCase()),
    )
  ) {
    throw new Error(
      'JWT_SECRET appears to be a weak or default value. ' +
        'Please generate a cryptographically secure secret using: openssl rand -base64 32',
    );
  }

  // Security validation: check for environment-specific weak patterns
  if (config.NODE_ENV === 'production') {
    if (
      trimmedSecret.includes('dev') ||
      trimmedSecret.includes('test') ||
      trimmedSecret.includes('local')
    ) {
      throw new Error(
        'JWT_SECRET in production must not contain development-related keywords. ' +
          'Generate a production-specific secret using: openssl rand -base64 32',
      );
    }
  }

  return trimmedSecret;
}

let requireAuthInstance: ReturnType<typeof expressjwt> | null = null;

function getRequireAuthMiddleware() {
  if (!requireAuthInstance) {
    requireAuthInstance = expressjwt({
      secret: validateJwtSecret(),
      algorithms: ['HS256'], // Only allow HS256 to prevent algorithm confusion attacks
      requestProperty: 'user',
      // Security: validate audience and issuer for enhanced security
      audience: secretsManager.getJwtAudience(),
      issuer: secretsManager.getJwtIssuer(),
      // Security: don't ignore expiration or not-before claims
      ignoreExpiration: false,
      ignoreNotBefore: false,
    });
  }
  return requireAuthInstance;
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return getRequireAuthMiddleware()(req, res, next);
};

/**
 * Custom error handler for JWT authentication errors
 * Prevents information disclosure in production
 */
export function jwtErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof UnauthorizedError) {
    const isProduction = config.NODE_ENV === 'production';

    if (isProduction) {
      // In production, don't expose detailed error information
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      // In development, provide more detailed error information
      res.status(401).json({
        error: 'Unauthorized',
        details: err.message,
      });
    }
    return;
  }

  // Pass other errors to the next error handler
  next(err);
}
