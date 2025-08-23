/**
 * Tests for src/tests/minioRepo.spec.ts module that exports a configured MinIO client.
 *
 * Testing library/framework: Jest (ts-jest)
 * - We mock the "minio" package to assert constructor args and prevent network access.
 * - We use jest.isolateModules to reload the module with different environment permutations.
 */

import path from "path";

// Create a stable module path to the unit under test.
// It resides next to this test file: src/tests/minioRepo.spec.ts
const MODULE_UNDER_TEST = path.join(__dirname, "minioRepo.spec.ts");

// Jest mock for "minio"
jest.mock("minio", () => {
  const ctor = jest.fn().mockImplementation((config: any) => {
    // Return a sentinel object to verify identity of the exported client
    return { __kind: "MockMinioClient", __config: config };
  });
  return { Client: ctor };
});

const { Client } = jest.requireMock("minio") as { Client: jest.Mock };

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
});

// Helper to load the module after setting env; returns { minioClient, config, ctor }
function loadWithEnv(env: Partial<NodeJS.ProcessEnv>) {
  Object.assign(process.env, env);

  // Load module under test in an isolated module context so top-level code re-executes with current env
  let exported: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    exported = require(MODULE_UNDER_TEST);
  });

  const ctorCalls = (Client as jest.Mock).mock.calls;
  if (ctorCalls.length === 0) {
    throw new Error("Expected minio.Client constructor to be called at least once");
  }
  const passedConfig = ctorCalls[0][0];
  return { minioClient: exported.minioClient, passedConfig, ctor: Client as jest.Mock };
}

describe("minio client configuration (minioRepo.spec.ts)", () => {
  test("constructs Client with explicit env vars (happy path)", () => {
    const { minioClient, passedConfig, ctor } = loadWithEnv({
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "1234",
      MINIO_ACCESS_KEY: "TEST_AK",
      MINIO_SECRET_KEY: "TEST_SK",
    });

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(passedConfig).toEqual({
      endPoint: "localhost",
      port: 1234,
      useSSL: false,
      accessKey: "TEST_AK",
      secretKey: "TEST_SK",
    });
    expect(minioClient).toEqual({ __kind: "MockMinioClient", __config: passedConfig });
  });

  test("defaults port to 9000 when MINIO_PORT is unset", () => {
    const { passedConfig } = loadWithEnv({
      MINIO_ENDPOINT: "minio.internal",
      // No MINIO_PORT provided
      MINIO_ACCESS_KEY: "AK",
      MINIO_SECRET_KEY: "SK",
    });

    expect(passedConfig.port).toBe(9000);
    expect(passedConfig.endPoint).toBe("minio.internal");
    expect(passedConfig.useSSL).toBe(false);
  });

  test("handles non-numeric MINIO_PORT by passing NaN as port", () => {
    const { passedConfig } = loadWithEnv({
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "not-a-number",
      MINIO_ACCESS_KEY: "AK",
      MINIO_SECRET_KEY: "SK",
    });

    // Number("not-a-number") yields NaN; assert that current behavior forwards NaN
    expect(Number.isNaN(passedConfig.port)).toBe(true);
  });

  test("allows missing MINIO_ENDPOINT (runtime receives undefined due to non-null assertion)", () => {
    const { passedConfig } = loadWithEnv({
      // No MINIO_ENDPOINT
      MINIO_PORT: "9002",
      MINIO_ACCESS_KEY: "AK",
      MINIO_SECRET_KEY: "SK",
    });

    expect(passedConfig.endPoint).toBeUndefined();
    expect(passedConfig.port).toBe(9002);
    expect(passedConfig.accessKey).toBe("AK");
    expect(passedConfig.secretKey).toBe("SK");
    expect(passedConfig.useSSL).toBe(false);
  });

  test("allows missing credentials (runtime receives undefined due to non-null assertion)", () => {
    const { passedConfig } = loadWithEnv({
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "9010",
      // No MINIO_ACCESS_KEY / MINIO_SECRET_KEY
    });

    expect(passedConfig.endPoint).toBe("localhost");
    expect(passedConfig.port).toBe(9010);
    expect(passedConfig.accessKey).toBeUndefined();
    expect(passedConfig.secretKey).toBeUndefined();
    expect(passedConfig.useSSL).toBe(false);
  });

  test("useSSL is always false per implementation", () => {
    const { passedConfig } = loadWithEnv({
      MINIO_ENDPOINT: "example.org",
      MINIO_PORT: "9443",
      MINIO_ACCESS_KEY: "AK",
      MINIO_SECRET_KEY: "SK",
    });

    expect(passedConfig.useSSL).toBe(false);
  });
});