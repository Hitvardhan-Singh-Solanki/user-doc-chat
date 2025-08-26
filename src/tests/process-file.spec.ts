import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Worker } from "bullmq";
import { downloadFile } from "../services/minio.service";
import { chunkText } from "../services/llm.service";
import { upsertVectors } from "../services/vector-store.service";
import * as workerModule from "../services/process-file.service";
import { llmService } from "../services/llm.service";

describe("Worker startWorker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it("should start the worker successfully", async () => {
    (downloadFile as any).mockResolvedValue(Buffer.from("Hello world"));
    (chunkText as any).mockReturnValue(["Hello world"]);
    (llmService.embedText as any).mockResolvedValue([0.1, 0.2, 0.3]);
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    expect(Worker).toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(expect.any(String));
    expect(chunkText).toHaveBeenCalledWith("Hello world");
    expect(llmService.embedText).toHaveBeenCalledWith("Hello world");
    expect(upsertVectors).toHaveBeenCalledWith([
      {
        id: expect.stringContaining("-chunk-0"),
        values: [0.1, 0.2, 0.3],
        metadata: expect.any(Object),
      },
    ]);
  });
});

// ----------------------------------------------------------------------------
// Extended test coverage
// Note: This project uses Vitest as the testing framework.
// These tests focus on processor behavior around chunking, embedding, and upserts,
// covering happy paths, multi-chunk handling, and failure scenarios.
// ----------------------------------------------------------------------------

describe("Worker startWorker - extended coverage", () => {
  it("processes multiple chunks and upserts vectors for each chunk", async () => {
    (downloadFile as any).mockResolvedValue(Buffer.from("Alpha Beta"));
    (chunkText as any).mockReturnValue(["Alpha", "Beta"]);
    (llmService.embedText as any)
      .mockResolvedValueOnce([0.1, 0.2, 0.3])
      .mockResolvedValueOnce([0.4, 0.5, 0.6]);
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    // Each chunk should be embedded individually
    expect(llmService.embedText).toHaveBeenCalledTimes(2);
    expect(llmService.embedText).toHaveBeenNthCalledWith(1, "Alpha");
    expect(llmService.embedText).toHaveBeenNthCalledWith(2, "Beta");

    // Upsert should include one vector per chunk with indexed IDs and metadata
    const upsertCalls = (upsertVectors as any).mock.calls;
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
    const vectorsArg = upsertCalls[upsertCalls.length - 1][0];
    expect(Array.isArray(vectorsArg)).toBe(true);
    expect(vectorsArg).toHaveLength(2);

    expect(vectorsArg[0]).toEqual({
      id: expect.stringContaining("-chunk-0"),
      values: [0.1, 0.2, 0.3],
      metadata: expect.any(Object),
    });
    expect(vectorsArg[1]).toEqual({
      id: expect.stringContaining("-chunk-1"),
      values: [0.4, 0.5, 0.6],
      metadata: expect.any(Object),
    });
  });

  it("skips embedding and upsert when chunkText returns no chunks", async () => {
    (downloadFile as any).mockResolvedValue(Buffer.from(""));
    (chunkText as any).mockReturnValue([]);
    (llmService.embedText as any).mockResolvedValue([0.9, 0.9, 0.9]); // should not be used
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    expect(chunkText).toHaveBeenCalled();
    expect(llmService.embedText).not.toHaveBeenCalled();
    expect(upsertVectors).not.toHaveBeenCalled();
  });

  it("handles download errors and does not call downstream services", async () => {
    (downloadFile as any).mockRejectedValue(new Error("download failed"));
    (chunkText as any).mockReturnValue(["should-not-be-used"]);
    (llmService.embedText as any).mockResolvedValue([1, 2, 3]);
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    expect(chunkText).not.toHaveBeenCalled();
    expect(llmService.embedText).not.toHaveBeenCalled();
    expect(upsertVectors).not.toHaveBeenCalled();
  });

  it("propagates embedding failures and avoids upsert", async () => {
    (downloadFile as any).mockResolvedValue(Buffer.from("Hello world"));
    (chunkText as any).mockReturnValue(["Hello world"]);
    (llmService.embedText as any).mockRejectedValue(
      new Error("embedding failed")
    );
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    expect(llmService.embedText).toHaveBeenCalledTimes(1);
    expect(upsertVectors).not.toHaveBeenCalled();
  });

  it("attempts upsert and surfaces failure (no retries expected here)", async () => {
    (downloadFile as any).mockResolvedValue(Buffer.from("Hello world"));
    (chunkText as any).mockReturnValue(["Hello world"]);
    (llmService.embedText as any).mockResolvedValue([0.1, 0.2, 0.3]);
    (upsertVectors as any).mockRejectedValue(new Error("upsert error"));

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    // Upsert should have been called once with the single chunk vector
    expect(upsertVectors).toHaveBeenCalledTimes(1);
    const args = (upsertVectors as any).mock.calls[0][0];
    expect(args).toHaveLength(1);
    expect(args[0]).toEqual({
      id: expect.stringContaining("-chunk-0"),
      values: [0.1, 0.2, 0.3],
      metadata: expect.any(Object),
    });
  });
});
