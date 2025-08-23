/**
 * Vitest-compatible variant of the bullmqRepo tests.
 * If your repo uses Jest, you can ignore/remove this file.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueOptions } from "bullmq";

const queueCtor = vi.fn();
const fakeQueueInstance = { __fake: "queue" };

vi.mock("bullmq", () => {
  return {
    Queue: function MockQueue(name: string, opts?: QueueOptions) {
      const created = (queueCtor as any)(name, opts);
      return created;
    },
  };
});

const importFresh = async () => {
  vi.resetModules();
  vi.doMock("bullmq", () => {
    return {
      Queue: function MockQueue(name: string, opts?: any) {
        const created = (queueCtor as any)(name, opts);
        return created;
      },
    };
  });
  return await import("./bullmqRepo.spec");
};

describe("bullmqRepo module (vitest)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    queueCtor.mockReset();
    (queueCtor as any).mockReturnValue(fakeQueueInstance);
    vi.resetModules();
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
    const [nameArg, optionsArg] = (queueCtor as any).mock.calls[0];
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
    const [, optionsArg] = (queueCtor as any).mock.calls[0];
    expect(optionsArg).toEqual({
      connection: {
        host: "my-redis",
        port: 6380,
      },
    });
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("treats REDIS_PORT='0' as port 0", async () => {
    process.env.REDIS_HOST = "redis-zero";
    process.env.REDIS_PORT = "0";

    const { fileQueue } = await importFresh();

    const [, optionsArg] = (queueCtor as any).mock.calls[0];
    expect(optionsArg?.connection?.host).toBe("redis-zero");
    expect(optionsArg?.connection?.port).toBe(0);
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("falls back to defaults when REDIS_HOST/REDIS_PORT are empty strings", async () => {
    process.env.REDIS_HOST = "";
    process.env.REDIS_PORT = "";

    const { fileQueue } = await importFresh();

    const [, optionsArg] = (queueCtor as any).mock.calls[0];
    expect(optionsArg).toEqual({
      connection: {
        host: "redis",
        port: 6379,
      },
    });
    expect(fileQueue).toBe(fakeQueueInstance);
  });

  it("passes NaN as port when REDIS_PORT is non-numeric", async () => {
    process.env.REDIS_HOST = "weird-redis";
    process.env.REDIS_PORT = "abc";

    const { fileQueue } = await importFresh();

    const [, optionsArg] = (queueCtor as any).mock.calls[0];
    expect(optionsArg?.connection?.host).toBe("weird-redis");
    expect(Number.isNaN(optionsArg?.connection?.port)).toBe(true);
    expect(fileQueue).toBe(fakeQueueInstance);
  });
});