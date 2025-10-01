import jwt, { SignOptions, JwtPayload, Algorithm } from 'jsonwebtoken';
import { JwtPayload as CustomJwtPayload } from '../types';
import { logger } from '../../config/logger.config';

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

/**
 * Validates and returns JWT expiration time from environment variables
 * @throws {Error} When JWT_EXPIRES_IN is missing or invalid
 */
function validateJwtExpiresIn(): number {
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN;

  if (!jwtExpiresIn || !jwtExpiresIn.trim()) {
    throw new Error(
      'JWT_EXPIRES_IN environment variable is required and must be non-empty. ' +
        'Please set JWT_EXPIRES_IN in your environment configuration.',
    );
  }

  const expiresIn = Number(jwtExpiresIn.trim());
  if (isNaN(expiresIn) || expiresIn <= 0) {
    throw new Error(
      `JWT_EXPIRES_IN must be a positive number, got: ${jwtExpiresIn}`,
    );
  }

  return expiresIn;
}

// Validate JWT configuration at module load time
const JWT_SECRET = validateJwtSecret();
const JWT_EXPIRES_IN = validateJwtExpiresIn();

/**
 * Signs a JWT payload using HS256 and returns the serialized token.
 *
 * @param payload - Claims to include in the JWT.
 * @param expiresIn - Token lifetime in seconds (default taken from the `JWT_EXPIRES_IN` environment variable).
 * @returns The signed JWT as a string.
 * @throws If signing fails (errors from `jsonwebtoken` are propagated).
 */
export function signJwt(
  payload: JwtPayload,
  expiresIn: number = JWT_EXPIRES_IN,
): string {
  const options: SignOptions = {
    expiresIn,
    algorithm: 'HS256',
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verifies a JWT and returns its payload if valid, otherwise returns `null`.
 *
 * Verification uses the module's configured secret and, by default, accepts HS256-signed tokens.
 * Includes additional security validations for token structure and claims.
 *
 * @param token - The JWT string to verify.
 * @param algorithms - Allowed signing algorithms for verification (defaults to `["HS256"]`).
 * @returns The decoded JWT payload on success, or `null` if verification fails.
 */
export function verifyJwt(
  token: string,
  algorithms: Algorithm[] = ['HS256'],
): JwtPayload | null {
  try {
    // Security validation: check token format
    if (!token || typeof token !== 'string') {
      logger.warn('JWT verification failed: invalid token format');
      return null;
    }

    // Security validation: check token structure (should have 3 parts separated by dots)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      logger.warn('JWT verification failed: invalid token structure');
      return null;
    }

    // Security validation: check for reasonable token length (not too short or too long)
    if (token.length < 20 || token.length > 8192) {
      logger.warn(
        'JWT verification failed: token length out of acceptable range',
      );
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms,
      // Security: prevent algorithm confusion attacks
      ignoreExpiration: false,
      ignoreNotBefore: false,
      // Security: validate audience and issuer if provided
      audience: process.env.JWT_AUDIENCE,
      issuer: process.env.JWT_ISSUER,
    }) as CustomJwtPayload;

    // Security validation: check for required claims
    if (!decoded.sub && !decoded.userId && !decoded.id) {
      logger.warn('JWT verification failed: missing subject claim');
      return null;
    }

    // Security validation: check token age (prevent very old tokens)
    const maxAge = process.env.JWT_MAX_AGE
      ? parseInt(process.env.JWT_MAX_AGE, 10)
      : 86400; // 24 hours default
    const issuedAt = (decoded as any).iat;
    if (issuedAt && Date.now() / 1000 - issuedAt > maxAge) {
      logger.warn('JWT verification failed: token too old');
      return null;
    }

    return decoded;
  } catch (error) {
    // Security: don't log sensitive error details in production
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      logger.warn('JWT verification failed');
    } else {
      logger.error(
        {
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'JWT verification failed',
      );
    }
    return null;
  }
}
