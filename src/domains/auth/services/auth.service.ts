import { IDBStore } from '@interfaces/db-store.interface';
import { User } from '@shared/types';
import { hashPassword, comparePassword } from '@utils/hash';
import { normalizeEmail } from '@utils/email';
import {
  InvalidCredentialsError,
  UserNotFoundError,
  InvalidPasswordHashError,
} from '@shared/errors/auth.errors';

export class AuthService {
  private db: IDBStore;

  constructor(dbStore: IDBStore) {
    this.db = dbStore;
  }

  /**
   * Sign up a new user
   */
  public async signUp(email: string, password: string): Promise<User> {
    try {
      const hashed = await hashPassword(password);
      const normalizedEmail = normalizeEmail(email);

      const result = await this.db.query<User>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        [normalizedEmail, hashed],
      );

      return result.rows[0];
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        throw new Error('Email already in use');
      }
      throw err;
    }
  }

  /**
   * Login a user
   */
  public async login(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const normalizedEmail = normalizeEmail(email);
    const result = await this.db.query<User>(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [normalizedEmail],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UserNotFoundError();
    }

    const userWithPassword = user as User & { password_hash: string };
    if (
      !userWithPassword.password_hash ||
      typeof userWithPassword.password_hash !== 'string' ||
      userWithPassword.password_hash.trim() === ''
    ) {
      throw new InvalidPasswordHashError();
    }

    const isValid = await comparePassword(
      password,
      userWithPassword.password_hash,
    );
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    return { id: user.id, email: user.email };
  }

  /**
   * Checks if a DB error is a unique constraint violation
   */
  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      (err as { code: string }).code === '23505'
    );
  }
}
