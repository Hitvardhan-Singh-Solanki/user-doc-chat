import { db } from "../repos/db.repo";
import { hashPassword, comparePassword } from "../utils/hash";

export async function signUp(email: string, password: string) {
  try {
    const hashed = await hashPassword(password);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashed]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new Error("Email already in use");
    }
    throw err;
  }
}

export async function login(email: string, password: string) {
  const result = await db.query(
    "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    throw new Error("Invalid credentials");
  }
  const isValid = await comparePassword(password, user.password_hash);
  if (!isValid) throw new Error("Invalid credentials");

  return { id: user.id, email: user.email };
}

export function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as any).code === "23505"
  );
}
