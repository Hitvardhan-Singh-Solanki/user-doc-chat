/**
 * Auth Service Unit Tests
 * Testing library/framework: Vitest (describe, it, expect, vi).
 * Detected from package.json ("vitest") and vitest.config.ts in repo root.
 *
 * Focus: Functions added/modified in the auth service (signUp, login, isPgUniqueViolation).
 * Coverage:
 *  - signUp: happy path, unique violation handling (23505), other DB errors, hash failures, empty password.
 *  - login: happy path, user not found, invalid password, DB error propagation.
 *  - isPgUniqueViolation: true/false cases across various inputs.
 *
 * Note: External dependencies are mocked:
 *   - ../repos/db.repo -> db.query
 *   - ../utils/hash -> hashPassword, comparePassword
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies BEFORE importing module under test
vi.mock("../repos/db.repo", () => ({
  db: {
    query: vi.fn(),
  },
}));

vi.mock("../utils/hash", () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

// Now import module under test and mocked deps
import { signUp, login, isPgUniqueViolation } from "../services/auth.service";
import { db } from "../repos/db.repo";
import { hashPassword, comparePassword } from "../utils/hash";

// Narrow the mocked instances
const mockedDbQuery = db.query as unknown as ReturnType<typeof vi.fn>;
const mockedHashPassword = hashPassword as unknown as ReturnType<typeof vi.fn>;
const mockedComparePassword = comparePassword as unknown as ReturnType<typeof vi.fn>;

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isPgUniqueViolation", () => {
    it('returns true when err.code === "23505"', () => {
      expect(isPgUniqueViolation({ code: "23505" })).toBe(true);
      expect(isPgUniqueViolation({ code: "23505", detail: "duplicate key" })).toBe(true);
    });

    it("returns false for non-matching shapes and values", () => {
      expect(isPgUniqueViolation(null)).toBe(false);
      expect(isPgUniqueViolation(undefined)).toBe(false);
      expect(isPgUniqueViolation("23505")).toBe(false);
      expect(isPgUniqueViolation(23505)).toBe(false);
      expect(isPgUniqueViolation({})).toBe(false);
      expect(isPgUniqueViolation({ code: "12345" })).toBe(false);
      expect(isPgUniqueViolation({ code: 23505 })).toBe(false);
    });
  });

  describe("signUp", () => {
    const email = "user@example.com";
    const password = "P@ssw0rd!";
    const hashed = "hashed-password";

    it("creates a new user and returns the created row on success", async () => {
      mockedHashPassword.mockResolvedValueOnce(hashed);
      const created = { id: 42, email, created_at: "2025-08-23T00:00:00.000Z" };
      mockedDbQuery.mockResolvedValueOnce({ rows: [created] });

      const result = await signUp(email, password);

      expect(mockedHashPassword).toHaveBeenCalledTimes(1);
      expect(mockedHashPassword).toHaveBeenCalledWith(password);

      expect(mockedDbQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockedDbQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT\s+INTO\s+users\s*\(email,\s*password_hash\)\s*VALUES\s*\(\$1,\s*\$2\)\s*RETURNING\s+id,\s+email,\s+created_at/i);
      expect(params).toEqual([email, hashed]);

      expect(result).toEqual(created);
    });

    it('throws "Email already in use" for PG unique violation (code 23505)', async () => {
      mockedHashPassword.mockResolvedValueOnce(hashed);
      mockedDbQuery.mockRejectedValueOnce({ code: "23505", message: "duplicate key value violates unique constraint" });

      await expect(signUp(email, password)).rejects.toThrow("Email already in use");
      expect(mockedHashPassword).toHaveBeenCalledTimes(1);
      expect(mockedDbQuery).toHaveBeenCalledTimes(1);
    });

    it("rethrows non-unique-violation database errors", async () => {
      mockedHashPassword.mockResolvedValueOnce(hashed);
      const dbErr = Object.assign(new Error("db down"), { code: "57P01" });
      mockedDbQuery.mockRejectedValueOnce(dbErr);

      await expect(signUp(email, password)).rejects.toBe(dbErr);
    });

    it("propagates hashPassword failures and does not call db.query", async () => {
      const hashErr = new Error("hash failed");
      mockedHashPassword.mockRejectedValueOnce(hashErr);

      await expect(signUp(email, password)).rejects.toBe(hashErr);
      expect(mockedDbQuery).not.toHaveBeenCalled();
    });

    it("handles empty password (no validation here) by still hashing and inserting", async () => {
      const emptyPassword = "";
      mockedHashPassword.mockResolvedValueOnce("hashed-empty");
      const created = { id: 7, email, created_at: "2025-08-23T00:00:00.000Z" };
      mockedDbQuery.mockResolvedValueOnce({ rows: [created] });

      const result = await signUp(email, emptyPassword);

      expect(mockedHashPassword).toHaveBeenCalledWith(emptyPassword);
      expect(result).toEqual(created);
    });
  });

  describe("login", () => {
    const email = "user@example.com";
    const password = "P@ssw0rd!";
    const userRow = {
      id: 101,
      email,
      password_hash: "stored-hash",
      created_at: "2025-08-23T00:00:00.000Z",
    };

    it("returns only { id, email } when credentials are valid", async () => {
      mockedDbQuery.mockResolvedValueOnce({ rows: [userRow] });
      mockedComparePassword.mockResolvedValueOnce(true);

      const result = await login(email, password);

      expect(mockedDbQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockedDbQuery.mock.calls[0];
      expect(sql).toMatch(/SELECT\s+id,\s+email,\s+password_hash,\s+created_at\s+FROM\s+users\s+WHERE\s+email\s*=\s*\$1/i);
      expect(params).toEqual([email]);

      expect(mockedComparePassword).toHaveBeenCalledWith(password, userRow.password_hash);

      expect(result).toEqual({ id: userRow.id, email: userRow.email });
      expect((result as any).password_hash).toBeUndefined();
      expect((result as any).created_at).toBeUndefined();
    });

    it('throws "Invalid credentials" when user is not found', async () => {
      mockedDbQuery.mockResolvedValueOnce({ rows: [] });

      await expect(login(email, password)).rejects.toThrow("Invalid credentials");
      expect(mockedComparePassword).not.toHaveBeenCalled();
    });

    it('throws "Invalid credentials" when password is incorrect', async () => {
      mockedDbQuery.mockResolvedValueOnce({ rows: [userRow] });
      mockedComparePassword.mockResolvedValueOnce(false);

      await expect(login(email, password)).rejects.toThrow("Invalid credentials");
    });

    it("propagates database errors from the SELECT query", async () => {
      const dbErr = new Error("temporary failure");
      mockedDbQuery.mockRejectedValueOnce(dbErr);

      await expect(login(email, password)).rejects.toBe(dbErr);
    });
  });
});