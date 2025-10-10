import bcrypt from 'bcrypt';
import pino from 'pino';
import { config } from '../../config/app.config';

const logger = pino({ name: 'hash-utils' });

const SALT_ROUNDS = config.SALT_ROUNDS;

export async function hashPassword(password: string): Promise<string> {
  // Validate input is not empty
  if (!password || password.trim().length === 0) {
    throw new Error('Password cannot be empty');
  }

  // Check UTF-8 byte length to guard against bcrypt's 72-byte truncation
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 72) {
    throw new Error(
      `Password exceeds bcrypt's 72-byte limit (${byteLength} bytes). Please use a shorter password.`,
    );
  }

  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
