import jwt, { SignOptions, JwtPayload, Algorithm } from 'jsonwebtoken';
import { JwtPayload as CustomJwtPayload } from '../types';
import { logger } from '../../config/logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN!;

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
  expiresIn: number = Number(JWT_EXPIRES_IN),
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
    return jwt.verify(token, JWT_SECRET, { algorithms }) as CustomJwtPayload;
  } catch (error) {
    logger.error({ error }, 'JWT verification failed:');
    return null;
  }
}
