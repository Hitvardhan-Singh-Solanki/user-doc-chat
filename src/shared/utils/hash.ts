import bcrypt from 'bcrypt';
import { config } from '@config';

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

  // Validate saltRounds before using it
  if (config.SALT_ROUNDS === undefined || config.SALT_ROUNDS === null) {
    throw new Error('SALT_ROUNDS configuration is missing');
  }

  const saltRounds = parseInt(String(config.SALT_ROUNDS), 10);

  if (!Number.isFinite(saltRounds) || Number.isNaN(saltRounds)) {
    throw new Error(
      `Invalid saltRounds value: ${config.SALT_ROUNDS}. Must be a finite integer.`,
    );
  }

  // Clamp saltRounds to bcrypt's valid range (4-31)
  const validSaltRounds = Math.max(4, Math.min(31, saltRounds));

  return await bcrypt.hash(password, validSaltRounds);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
