import { describe, it, test, expect, vi, beforeEach, afterAll } from "vitest";
import type { PoolConfig } from "pg";

/**
 * Tests for the database Pool initialization module (src/repos/db.repo.ts).
 *
 * Framework: Vitest
 * - We use vi.mock to stub "pg" and capture Pool constructor calls.
 * - We use vi.resetModules to re-import the module and re-run top-level env checks each test.
 */

// Mock "pg" to avoid real DB connections and to inspect constructor arguments
vi.mock("pg", () => {
  const Pool = vi.fn((config: PoolConfig) => {
    return { __isMockPool: true, __config: config } as any;
  });
  return { Pool };
});

const MODULE_PATH = "../repos/db.repo";

// Helper to import the module under test with a fresh module registry
async function importFreshModule() {
  await vi.resetModules();
  return await import(MODULE_PATH);
}

// Helper to access the mocked Pool function
async function getPoolMock() {
  const { Pool } = await import("pg");
  return Pool as unknown as vi.Mock;
}

describe("db Pool initialization (src/repos/db.repo.ts)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    // Reset env and mocks before each test
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.PG_SSL;
    vi.clearAllMocks();
    await vi.resetModules();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("throws if DATABASE_URL is not set at module import time", async () => {
    const poolMock = await getPoolMock();
    await expect(importFreshModule()).rejects.toThrow("DATABASE_URL is not set");
    expect(poolMock).not.toHaveBeenCalled();
  });

  it("creates Pool with provided DATABASE_URL and ssl=false when PG_SSL is undefined", async () => {
    const poolMock = await getPoolMock();
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    const mod = await importFreshModule();

    expect(poolMock).toHaveBeenCalledTimes(1);
    const [config] = poolMock.mock.calls[0];
    expect(config).toMatchObject<Partial<PoolConfig>>({
      connectionString: "postgres://user:pass@localhost:5432/db",
      ssl: false,
    });

    // export presence
    expect(mod.db).toBeDefined();
    expect((mod.db as any).__isMockPool).toBe(true);
  });

  describe("PG_SSL handling exactness", () => {
    const cases: Array<{ value: string | undefined; expectedSsl: any; label: string }> = [
      { value: "true", expectedSsl: { rejectUnauthorized: false }, label: 'exact string "true"' },
      { value: "false", expectedSsl: false, label: 'string "false"' },
      { value: "", expectedSsl: false, label: "empty string" },
      { value: "TRUE", expectedSsl: false, label: "uppercase TRUE" },
      { value: "1", expectedSsl: false, label: "numeric string 1" },
      { value: "TrUe", expectedSsl: false, label: "mixed case TrUe" },
      { value: undefined, expectedSsl: false, label: "undefined" },
    ];

    test.each(cases)("sets ssl correctly when PG_SSL is %s ($label)", async ({ value, expectedSsl }) => {
      const poolMock = await getPoolMock();
      process.env.DATABASE_URL = "postgres://host/db";
      if (typeof value === "undefined") delete process.env.PG_SSL;
      else process.env.PG_SSL = value;

      await importFreshModule();

      expect(poolMock).toHaveBeenCalledTimes(1);
      const [config] = poolMock.mock.calls[0];
      expect(config.ssl).toEqual(expectedSsl);
    });
  });

  it("passes the exact connectionString through without modification for various URLs", async () => {
    const urls = [
      "postgres://user:pass@localhost:5432/svc_db",
      "postgresql://user@domain.com:password@db.example.com:6543/prod?sslmode=disable",
      "postgres://localhost/mydb?schema=public&application_name=my-app",
    ];

    for (const url of urls) {
      const poolMock = await getPoolMock();
      await vi.resetModules();
      vi.clearAllMocks();

      process.env.DATABASE_URL = url;
      await importFreshModule();

      expect(poolMock).toHaveBeenCalledTimes(1);
      const [config] = poolMock.mock.calls[0];
      expect(config.connectionString).toBe(url);
    }
  });
});