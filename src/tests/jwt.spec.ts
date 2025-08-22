/* 
  Tests for jwt helper functions.

  Framework note:
  - This file uses Jest-style APIs (describe/it/expect and jest.mock).
  - If your project uses Vitest, these tests are compatible with minimal changes: 
    replace jest.mock with vi.mock and jest.fn with vi.fn, or enable Jest-compat options if configured.

  Scope:
  - Focuses on behaviors introduced in the current diff for signJwt/verifyJwt.
  - Mocks jsonwebtoken to assert correct arguments without relying on real crypto.

  Edge cases covered:
  - expiresIn undefined (fallback)
  - expiresIn numeric and numeric string
  - expiresIn non-numeric string (produces NaN under current implementation)
  - JWT_SECRET sourcing (env vs default)
  - verify success and failure paths
*/

import type { SignOptions } from "jsonwebtoken";

// Use explicit import path to the module under test.
// Adjust this path if your jwt helpers live elsewhere (e.g., src/utils/jwt.ts).
// We attempt the most likely paths first via try-catch dynamic require for portability in varied repos.
let jwtModule: any;
let signJwt: (payload: object, expiresIn?: string | number) => string;
let verifyJwt: (token: string) => any;

// Mock jsonwebtoken before importing the module under test
// For Vitest users: replace jest.mock with vi.mock, jest.fn with vi.fn
jest.mock("jsonwebtoken", () => {
  return {
    __esModule: true,
    default: {
      sign: jest.fn((_payload: object, _secret: string, _options: SignOptions) => "signed.token.mock"),
      verify: jest.fn((_token: string, _secret: string) => ({ ok: true, sub: "123" })),
    },
    sign: jest.fn((_payload: object, _secret: string, _options: SignOptions) => "signed.token.mock"),
    verify: jest.fn((_token: string, _secret: string) => ({ ok: true, sub: "123" })),
  };
});

import jwt from "jsonwebtoken";

// Helper to reset env with isolation per test
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  // Default unset to exercise fallbacks unless a test sets them explicitly
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;

  // Dynamically import the module under test using common candidate paths
  // We avoid top-level static import to allow env defaults to be set per test.
  const candidates = [
    "src/utils/jwt",
    "src/jwt",
    "src/lib/jwt",
    "src/helpers/jwt",
    "src/services/jwt",
    "src/auth/jwt",
    // If the file under test is colocated with tests (as snippet suggests), include a relative fallback
    "src/tests/__under_test__/jwt" // optional placeholder; ignored if nonexistent
  ];
  let loaded: any = null;
  for (const p of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      loaded = require((p + ".ts") as string);
      break;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        loaded = require((p + ".js") as string);
        break;
      } catch {
        // continue
      }
    }
  }
  if (!loaded) {
    // As a last resort, attempt to require the sibling file when tests live alongside source.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      loaded = require("../utils/jwt");
    } catch {}
  }
  if (!loaded) {
    // Finally, try the root-level jwt.ts if present
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      loaded = require("../../src/jwt");
    } catch {}
  }
  if (!loaded) {
    // If still not found, throw a descriptive error to help the contributor fix the import path.
    throw new Error(
      "Could not locate the jwt module under test. Adjust import path candidates in jwt.spec.ts to match your repo structure."
    );
  }

  jwtModule = loaded;
  signJwt = loaded.signJwt;
  verifyJwt = loaded.verifyJwt;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("signJwt", () => {
  it("signs with default secret when JWT_SECRET is not set", () => {
    const payload = { userId: "u1" };
    const token = signJwt(payload);

    expect(token).toBe("signed.token.mock");
    // Ensure jsonwebtoken.sign called with default "supersecret"
    expect((jwt as any).sign).toHaveBeenCalledTimes(1);
    const [, usedSecret, options] = ((jwt as any).sign as jest.Mock).mock.calls[0];
    expect(usedSecret).toBe("supersecret");
    expect((options as SignOptions).expiresIn).toBe("15m"); // fallback when env and arg undefined
  });

  it("uses JWT_SECRET from env when set", () => {
    process.env.JWT_SECRET = "envsecret";
    // Re-import module to capture env at module scope if needed
    jest.resetModules();
    const loaded = require(getCandidatePath());
    signJwt = loaded.signJwt;

    const payload = { role: "admin" };
    signJwt(payload, 3600);

    const [, usedSecret] = ((jwt as any).sign as jest.Mock).mock.calls[0];
    expect(usedSecret).toBe("envsecret");
  });

  it("sets expiresIn to provided number when expiresIn is numeric", () => {
    const payload = { a: 1 };
    signJwt(payload, 7200);
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    expect(options.expiresIn).toBe(7200);
  });

  it("coerces numeric string expiresIn to number (e.g., '1800' -> 1800)", () => {
    const payload = { a: 1 };
    // Note: current implementation coerces via Number(), so numeric strings succeed.
    signJwt(payload, "1800" as unknown as number);
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    expect(options.expiresIn).toBe(1800);
  });

  it("when expiresIn is a non-numeric string (e.g., '15m'), passes NaN due to Number('15m')", () => {
    const payload = { a: 1 };
    signJwt(payload, "15m" as unknown as number);
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    // Validate current (possibly buggy) behavior explicitly
    expect(Number.isNaN(options.expiresIn as unknown as number)).toBe(true);
  });

  it("falls back to '15m' when both arg and JWT_EXPIRES_IN are undefined", () => {
    delete process.env.JWT_EXPIRES_IN;
    const payload = { a: 1 };
    signJwt(payload);
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    expect(options.expiresIn).toBe("15m");
  });

  it("when JWT_EXPIRES_IN is numeric string in env (e.g., '3600'), uses its numeric value", () => {
    process.env.JWT_EXPIRES_IN = "3600";
    // Re-import module to capture default parameter from env
    jest.resetModules();
    const loaded = require(getCandidatePath());
    signJwt = loaded.signJwt;

    const payload = { x: true };
    signJwt(payload);
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    expect(options.expiresIn).toBe(3600);
  });

  it("when JWT_EXPIRES_IN is a non-numeric string in env (e.g., '15m'), passes NaN due to Number('15m')", () => {
    process.env.JWT_EXPIRES_IN = "15m";
    jest.resetModules();
    const loaded = require(getCandidatePath());
    signJwt = loaded.signJwt;

    signJwt({ ok: 1 });
    const call = ((jwt as any).sign as jest.Mock).mock.calls[0];
    const options = call[2] as SignOptions;
    expect(Number.isNaN(options.expiresIn as unknown as number)).toBe(true);
  });

  it("passes payload through unchanged to jsonwebtoken.sign", () => {
    const payload = { nested: { a: 1 }, arr: [1, 2, 3] };
    signJwt(payload, 60);
    const [usedPayload] = ((jwt as any).sign as jest.Mock).mock.calls[0];
    expect(usedPayload).toEqual(payload);
  });
});

describe("verifyJwt", () => {
  it("verifies token using the default secret when env not set", () => {
    const decoded = verifyJwt("tok");
    expect(decoded).toEqual({ ok: true, sub: "123" });

    const [tokenArg, secretArg] = ((jwt as any).verify as jest.Mock).mock.calls[0];
    expect(tokenArg).toBe("tok");
    expect(secretArg).toBe("supersecret");
  });

  it("verifies token using env JWT_SECRET when set", () => {
    process.env.JWT_SECRET = "envsecret";
    jest.resetModules();
    const loaded = require(getCandidatePath());
    verifyJwt = loaded.verifyJwt;

    verifyJwt("tok2");
    const [, secretArg] = ((jwt as any).verify as jest.Mock).mock.calls[0];
    expect(secretArg).toBe("envsecret");
  });

  it("propagates verification errors from jsonwebtoken.verify", () => {
    ((jwt as any).verify as jest.Mock).mockImplementation(() => {
      const err: any = new Error("invalid signature");
      err.name = "JsonWebTokenError";
      throw err;
    });

    expect(() => verifyJwt("bad.token")).toThrowError("invalid signature");
  });
});

/**
 * Utility: resolve the module path used above in beforeEach when re-importing after env changes.
 * Keep this consistent with the candidate list to avoid duplication.
 */
function getCandidatePath(): string {
  const candidates = [
    "src/utils/jwt",
    "src/jwt",
    "src/lib/jwt",
    "src/helpers/jwt",
    "src/services/jwt",
    "src/auth/jwt",
    "../utils/jwt",
    "../../src/jwt"
  ];
  for (const p of candidates) {
    try {
      require.resolve(p + ".ts");
      return p;
    } catch {
      try {
        require.resolve(p + ".js");
        return p;
      } catch {
        /* continue */
      }
    }
  }
  throw new Error("Adjust getCandidatePath() to your repository's actual jwt module location.");
}