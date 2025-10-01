import { expressjwt, UnauthorizedError } from 'express-jwt';
import { Request, Response, NextFunction } from 'express';

/**
 * Validates and returns JWT secret from environment variables
 * @throws {Error} When JWT_SECRET is missing, empty, or doesn't meet security requirements
 */
function validateJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;

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
  if (process.env.NODE_ENV === 'production') {
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

// Validate JWT secret at module load time
const validatedJwtSecret = validateJwtSecret();

export const requireAuth = expressjwt({
  secret: validatedJwtSecret,
  algorithms: ['HS256'], // Only allow HS256 to prevent algorithm confusion attacks
  requestProperty: 'user',
  // Security: validate audience and issuer if provided
  audience: process.env.JWT_AUDIENCE,
  issuer: process.env.JWT_ISSUER,
  // Security: don't ignore expiration or not-before claims
  ignoreExpiration: false,
  ignoreNotBefore: false,
});

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
    const isProduction = process.env.NODE_ENV === 'production';

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
