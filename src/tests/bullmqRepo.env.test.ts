/**
 * Note on framework: This test suite is written using Jest-style APIs
 * (describe/it/expect/jest.mock). Many repositories also run Vitest which
 * supports the same BDD syntax for describe/it/expect; if using Vitest,
 * replace jest.mock/jest.spyOn with vi.mock/vi.spyOn as needed.
 *
 * Covered scenarios:
 * - Exports: queueName equals "file-processing"
 * - Defaults: uses host "redis" and port 6379 when env not provided
 * - Overrides: respects REDIS_HOST and REDIS_PORT (including "0")
 * - Invalid port: non-numeric REDIS_PORT results in Number(NaN) being used
 * - fileQueue is the exact instance created by Queue(...)
 */

import type { QueueOptions } from "bullmq";

// We must mock bullmq before importing the module under test because it constructs
// the Queue at import time.
const queueCtor = jest.fn();
const fakeQueueInstance = { __fake: "queue" };

jest.mock("bullmq", () => {
  return {
    Queue: function MockQueue(name: string, opts?: QueueOptions) {
      // record the args on the jest.fn for assertions
      // ensure 'this' can be used if code under test does anything with instance methods
      // eslint-disable-next-line no-new-object
      const created = (queueCtor as any)(name, opts);
      return created;
    },
  };
});

// Helper to reload the module with a clean environment and fresh mocks
const importFresh = async () => {
  jest.resetModules();
  // Re-apply the mock after resetModules
  jest.doMock("bullmq", () => {
    return {
      Queue: function MockQueue(name: string, opts?: any) {
        const created = (queueCtor as any)(name, opts);
        return created;
      },
    };
  });
  return await import("./bullmqRepo.spec"); // path provided by the PR snippet
};

describe("bullmqRepo module", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // fresh clone so mutations won't leak between tests
    process.env = { ...ORIGINAL_ENV };
    queueCtor.mockReset();
    (queueCtor as jest.Mock).mockReturnValue(fakeQueueInstance);
    jest.resetModules();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("exports queueName as 'file-processing'", async () => {
    const { queueName } = await importFresh();
    expect(queueName).toBe("file-processing");
  });

  it("creates Queue with default host 'redis' and port 6379 when env not set", async () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;

    const { fileQueue } = await importFresh();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const [nameArg, optionsArg] = (queueCtor as jest.Mock).mock.calls[0];
    expect(nameArg).toBe("file-processing");
    expect(optionsArg).toEqual({
      connection: {
        host: "redis",
        port: 6379,
      },
    });
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("uses REDIS_HOST and REDIS_PORT if provided", async () => {
    process.env.REDIS_HOST = "my-redis";
    process.env.REDIS_PORT = "6380";

    const { fileQueue } = await importFresh();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const [nameArg, optionsArg] = (queueCtor as jest.Mock).mock.calls[0];
    expect(nameArg).toBe("file-processing");
    expect(optionsArg).toEqual({
      connection: {
        host: "my-redis",
        port: 6380,
      },
    });
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("treats REDIS_PORT='0' as port 0 (truthy string, Number('0') -> 0)", async () => {
    process.env.REDIS_HOST = "redis-zero";
    process.env.REDIS_PORT = "0";

    const { fileQueue } = await importFresh();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const [, optionsArg] = (queueCtor as jest.Mock).mock.calls[0];
    expect(optionsArg?.connection?.host).toBe("redis-zero");
    expect(optionsArg?.connection?.port).toBe(0);
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("falls back to defaults when REDIS_HOST/REDIS_PORT are empty strings", async () => {
    // Because of `process.env.REDIS_* || 6379`, empty string should fallback to default
    process.env.REDIS_HOST = "";
    process.env.REDIS_PORT = "";

    const { fileQueue } = await importFresh();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const [, optionsArg] = (queueCtor as jest.Mock).mock.calls[0];
    expect(optionsArg).toEqual({
      connection: {
        host: "redis",
        port: 6379,
      },
    });
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("passes NaN as port when REDIS_PORT is non-numeric (module does not validate)", async () => {
    process.env.REDIS_HOST = "weird-redis";
    process.env.REDIS_PORT = "abc"; // Number('abc') -> NaN

    const { fileQueue } = await importFresh();

    expect(queueCtor).toHaveBeenCalledTimes(1);
    const [, optionsArg] = (queueCtor as jest.Mock).mock.calls[0];

    expect(optionsArg?.connection?.host).toBe("weird-redis");

    // Validate NaN inside the captured call
    // We can't use toEqual on object with NaN (would fail), so assert explicitly:
    expect(Number.isNaN(optionsArg?.connection?.port)).toBe(true);

    expect(fileQueue).toBe(fakeQueueInstance);
  });
});