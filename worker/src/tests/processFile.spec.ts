import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Worker } from "bullmq";
import { downloadFile } from "../service/minio";
import { chunkText, embedText } from "../service/embeddings";
import { upsertVectors } from "../service/pinecone";
import * as workerModule from "../service/processFile";

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
    (embedText as any).mockResolvedValue([0.1, 0.2, 0.3]);
    (upsertVectors as any).mockResolvedValue(undefined);

    const startWorkerFn = (workerModule as any).startWorker;
    await startWorkerFn();

    expect(Worker).toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String)
    );
    expect(chunkText).toHaveBeenCalledWith("Hello world");
    expect(embedText).toHaveBeenCalledWith("Hello world");
    expect(upsertVectors).toHaveBeenCalledWith([
      {
        id: expect.stringContaining("-chunk-0"),
        values: [0.1, 0.2, 0.3],
        metadata: expect.any(Object),
      },
    ]);
  });
});
