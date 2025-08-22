import { hashPassword, comparePassword } from "../utils/hash";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function signUp(email: string, password: string) {
  const hashed = await hashPassword(password);
  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
    [email, hashed]
  );
  return result.rows[0];
}

export async function login(email: string, password: string) {
  const result = await pool.query("SELECT * FROM users WHERE email=$1", [
    email,
  ]);
  const user = result.rows[0];
  if (!user) throw new Error("User not found");

  const isValid = await comparePassword(password, user.password_hash);
  if (!isValid) throw new Error("Invalid password");

  return { id: user.id, email: user.email };
}
