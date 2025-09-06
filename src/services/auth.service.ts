import { IDBStore } from "../interfaces/db-store.interface";
import { User } from "../types";
import { hashPassword, comparePassword } from "../utils/hash";

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
      const normalizedEmail = email.trim().toLowerCase();

      const result = await this.db.query<User>(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
        [normalizedEmail, hashed]
      );

      return result.rows[0];
    } catch (err: any) {
      if (this.isUniqueViolation(err)) {
        throw new Error("Email already in use");
      }
      throw err;
    }
  }

  /**
   * Login a user
   */
  public async login(
    email: string,
    password: string
  ): Promise<{ id: string; email: string }> {
    const result = await this.db.query<User>(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValid = await comparePassword(
      password,
      (user as any).password_hash
    );
    if (!isValid) throw new Error("Invalid credentials");

    return { id: user.id, email: user.email };
  }

  /**
   * Checks if a DB error is a unique constraint violation
   */
  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === "object" && err !== null && (err as any).code === "23505"
    );
  }
}
