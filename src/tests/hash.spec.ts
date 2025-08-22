/**
 * Unit tests for hash utilities using bcrypt.
 *
 * This suite validates:
 * - hashPassword returns a hash string and calls bcrypt.hash with correct salt rounds
 * - comparePassword delegates to bcrypt.compare and returns booleans accordingly
 * - SALT_ROUNDS defaults to 10 when process.env.SALT_ROUNDS is unset
 * - SALT_ROUNDS respects process.env.SALT_ROUNDS when set
 * - Invalid SALT_ROUNDS (non-number) leads to NaN being passed to bcrypt.hash (matching current implementation)
 * - Errors from bcrypt.hash/compare are propagated (promise rejects)
 *
 * Test runner compatibility:
 * - Jest: uses jest.fn/jest.mock/jest.resetModules
 * - Vitest: uses vi.fn/vi.mock/vi.resetModules (aliased if available)
 */

type JestLike = typeof jest | undefined;
type VitestLike = typeof vi | undefined;

// Provide cross-runner guards
const isVitest: boolean = typeof (globalThis as any).vi !== "undefined";
const isJest: boolean = typeof (globalThis as any).jest !== "undefined";
const mocker = (isVitest ? (vi as VitestLike) : (isJest ? (jest as JestLike) : undefined)) as any;

if (!mocker) {
  // Fallback: minimal shim to avoid runtime errors if neither is available.
  // Your project's runner should provide jest or vi; otherwise, please adapt.
  throw new Error("No supported test runner detected (expected Jest or Vitest).");
}

// Helper to reset module registry between tests so env-dependent constants recompute
const resetModules = async () => {
  if (isVitest) {
    (vi as any).resetModules();
    (vi as any).clearAllMocks();
    (vi as any).restoreAllMocks();
  } else if (isJest) {
    (jest as any).resetModules();
    (jest as any).clearAllMocks();
    (jest as any).restoreAllMocks();
  }
};

// Resolve the path to the module under test by searching common locations.
// Adjust the import path below to match your repository if needed.
//
// Priority order (first existing): 
//  - src/hash.ts
//  - src/utils/hash.ts
//  - src/lib/hash.ts
//  - src/services/hash.ts
//  - src/auth/hash.ts
//
// We try dynamic import with sequential fallbacks to avoid hardcoding.
async function importHashModule() {
  const candidates = [
    "src/hash.ts",
    "src/utils/hash.ts",
    "src/lib/hash.ts",
    "src/services/hash.ts",
    "src/auth/hash.ts",
    // As a very last resort, some projects export via index.ts
    "src/index.ts",
  ];

  for (const p of candidates) {
    try {
      // @ts-ignore - dynamic path for tests only
      const mod = await import((p as any));
      if (mod && (typeof mod.hashPassword === "function") && (typeof mod.comparePassword === "function")) {
        return { mod, path: p };
      }
    } catch {
      // Try next candidate
    }
  }
  throw new Error(
    "Could not locate a module exporting { hashPassword, comparePassword }. " +
    "Please ensure one exists at one of the common paths (e.g., src/utils/hash.ts) " +
    "or update the test to point to the correct file.");
}

// Mock bcrypt at the module boundary
function setupBcryptMock() {
  const bcryptMock = {
    hash: mocker.fn<[], any>(),
    compare: mocker.fn<[], any>(),
  };

  const factory = () => bcryptMock;

  if (isVitest) {
    (vi as any).mock("bcrypt", factory as any);
  } else if (isJest) {
    (jest as any).mock("bcrypt", factory as any);
  }

  return bcryptMock;
}

// Utility to run a test case with clean env and module registry
async function withIsolatedEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>) {
  const prev = { ...process.env };
  try {
    Object.keys(env).forEach((k) => {
      if (typeof env[k] === "undefined") delete (process.env as any)[k];
      else (process.env as any)[k] = env[k] as string;
    });
    await resetModules();
    return await fn();
  } finally {
    process.env = prev;
    await resetModules();
  }
}

describe("hash utilities (bcrypt)", () => {
  it("hashPassword uses default SALT_ROUNDS=10 when SALT_ROUNDS env is unset", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: undefined }, async () => {
      const bcryptMock = setupBcryptMock();
      bcryptMock.hash.mockResolvedValueOnce("hashed-default-10");

      const { mod, path } = await importHashModule();
      expect(typeof mod.hashPassword).toBe("function");

      const result = await mod.hashPassword("secret");
      expect(result).toBe("hashed-default-10");

      // Verify bcrypt.hash called with password and 10
      expect(bcryptMock.hash).toHaveBeenCalledTimes(1);
      expect(bcryptMock.hash).toHaveBeenCalledWith("secret", 10);
    });
  });

  it("hashPassword uses SALT_ROUNDS from env (e.g., 12)", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: "12" }, async () => {
      const bcryptMock = setupBcryptMock();
      bcryptMock.hash.mockResolvedValueOnce("hashed-12");

      const { mod } = await importHashModule();
      const out = await mod.hashPassword("hunter2");

      expect(out).toBe("hashed-12");
      expect(bcryptMock.hash).toHaveBeenCalledTimes(1);
      expect(bcryptMock.hash).toHaveBeenCalledWith("hunter2", 12);
    });
  });

  it("hashPassword passes NaN to bcrypt when SALT_ROUNDS env is invalid (current behavior)", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: "abc" }, async () => {
      const bcryptMock = setupBcryptMock();
      bcryptMock.hash.mockResolvedValueOnce("hashed-NaN");

      const { mod } = await importHashModule();
      await mod.hashPassword("pw");

      const call = (bcryptMock.hash as any).mock.calls[0];
      expect(call[0]).toBe("pw");
      // SALT_ROUNDS becomes NaN due to parseInt('abc', 10) => NaN
      expect(Number.isNaN(call[1])).toBe(true);
    });
  });

  it("hashPassword rejects when bcrypt.hash rejects", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: undefined }, async () => {
      const bcryptMock = setupBcryptMock();
      const err = new Error("hashing failed");
      bcryptMock.hash.mockRejectedValueOnce(err);

      const { mod } = await importHashModule();
      await expect(mod.hashPassword("oops")).rejects.toBe(err);
      expect(bcryptMock.hash).toHaveBeenCalledWith("oops", 10);
    });
  });

  it("comparePassword returns true/false based on bcrypt.compare", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: undefined }, async () => {
      const bcryptMock = setupBcryptMock();
      bcryptMock.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const { mod } = await importHashModule();

      await expect(mod.comparePassword("pw", "hash")).resolves.toBe(true);
      await expect(mod.comparePassword("pw2", "hash2")).resolves.toBe(false);

      expect(bcryptMock.compare).toHaveBeenCalledTimes(2);
      expect(bcryptMock.compare).toHaveBeenNthCalledWith(1, "pw", "hash");
      expect(bcryptMock.compare).toHaveBeenNthCalledWith(2, "pw2", "hash2");
    });
  });

  it("comparePassword rejects when bcrypt.compare rejects", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: undefined }, async () => {
      const bcryptMock = setupBcryptMock();
      const err = new Error("compare failed");
      bcryptMock.compare.mockRejectedValueOnce(err);

      const { mod } = await importHashModule();

      await expect(mod.comparePassword("pw", "hash")).rejects.toBe(err);
      expect(bcryptMock.compare).toHaveBeenCalledWith("pw", "hash");
    });
  });

  it("handles empty password string (still delegates to bcrypt.hash)", async () => {
    await withIsolatedEnv({ SALT_ROUNDS: undefined }, async () => {
      const bcryptMock = setupBcryptMock();
      bcryptMock.hash.mockResolvedValueOnce("hashed-empty");

      const { mod } = await importHashModule();
      const out = await mod.hashPassword("");

      expect(out).toBe("hashed-empty");
      expect(bcryptMock.hash).toHaveBeenCalledWith("", 10);
    });
  });
});