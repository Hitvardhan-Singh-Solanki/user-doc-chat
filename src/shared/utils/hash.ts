import bcrypt from 'bcrypt';
import pino from 'pino';

const logger = pino({ name: 'hash-utils' });

const SALT_ROUNDS = (() => {
  const envValue = process.env.SALT_ROUNDS;
  if (!envValue) return 10;

  const parsed = parseInt(envValue, 10);

  // Check for NaN or invalid values
  if (isNaN(parsed)) {
    logger.warn(`Invalid SALT_ROUNDS value "${envValue}", using default: 10`);
    return 10;
  }

  // Enforce safe bounds (min 10, max 15) for bcrypt security/performance
  const MIN_ROUNDS = 10;
  const MAX_ROUNDS = 15;

  if (parsed < MIN_ROUNDS) {
    logger.warn(
      `SALT_ROUNDS value ${parsed} is below minimum ${MIN_ROUNDS}, clamping to ${MIN_ROUNDS}`,
    );
    return MIN_ROUNDS;
  }

  if (parsed > MAX_ROUNDS) {
    logger.warn(
      `SALT_ROUNDS value ${parsed} exceeds maximum ${MAX_ROUNDS}, clamping to ${MAX_ROUNDS}`,
    );
    return MAX_ROUNDS;
  }

  return parsed;
})();

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
