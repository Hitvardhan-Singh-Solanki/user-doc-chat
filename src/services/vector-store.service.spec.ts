import { describe, it, beforeEach, expect, vi } from "vitest";
import { VectorStoreService } from "./vector-store.service";
import { LLMService } from "./llm.service";

describe("VectorStoreService", () => {
  let mockLLM: any;
  let mockVectorStore: any;
  let svc: VectorStoreService;

  beforeEach(() => {
    // Mock LLMService.generateAnswerStream as async generator
    mockLLM = {
      generateAnswerStream: vi.fn(async function* (_input: any) {
        yield "token1";
        yield "token2";
      }),
    };

    // Mock Pinecone/Postgres vector store with upsert/query spies
    mockVectorStore = {
      upsertVectors: vi.fn(async (vectors: any[]) => ({
        upsertedCount: vectors.length, // match IVectorStore interface
      })),
      queryVector: vi.fn(async () => [
        { score: 0.9, metadata: { text: "match1" } },
      ]),
    };

    // Subclass VectorStoreService to inject mockVectorStore
    class TestVectorStoreService extends VectorStoreService {
      constructor(llm: any) {
        super(llm, "pinecone");
        // Override private vectorStore
        (this as any).vectorStore = mockVectorStore;
      }
    }

    svc = new TestVectorStoreService(mockLLM);
  });

  it("upsertVectors calls underlying vector store", async () => {
    const vectors = [{ id: "1", values: [0.1, 0.2], metadata: {} }];
    const res = await svc.upsertVectors(vectors);
    expect(mockVectorStore.upsertVectors).toHaveBeenCalledWith(vectors);
    expect(res.upsertedCount).toBe(1);
  });

  it("query calls underlying vector store", async () => {
    const embedding = [0.1, 0.2];
    const userId = "user1";
    const fileId = "file1";
    const topK = 3;
    const res = await svc.query(embedding, userId, fileId, topK);
    expect(mockVectorStore.queryVector).toHaveBeenCalledWith(
      embedding,
      userId,
      fileId,
      topK
    );
    expect(res).toEqual([{ score: 0.9, metadata: { text: "match1" } }]);
  });

  it("getContextWithSummarization returns concatenated high relevance and summarized low relevance chunks", async () => {
    const results = {
      matches: [
        { metadata: { text: "high1" } },
        { metadata: { text: "high2" } },
        { metadata: { text: "low1" } },
        { metadata: { text: "low2" } },
      ],
    };

    // Set topK=2 so first two are high relevance
    process.env.PINECONE_TOP_K = "2";
    const context = await svc.getContextWithSummarization(results);

    expect(context).toContain("high1");
    expect(context).toContain("high2");
    // low relevance should be summarized by LLM
    expect(mockLLM.generateAnswerStream).toHaveBeenCalled();
    expect(context).toContain("token1");
    expect(context).toContain("token2");
  });

  it("getContextWithSummarization respects maxContextTokens", async () => {
    const results = {
      matches: Array.from({ length: 10 }, (_, i) => ({
        metadata: { text: "A".repeat(500) },
      })),
    };

    process.env.MAX_CONTEXT_TOKENS = "50"; // small to trigger token limit
    const context = await svc.getContextWithSummarization(results);

    // Token limit should truncate some chunks
    expect(context.length).toBeLessThan(5000);
  });

  it("summarizeLowRelevanceChunks returns empty string when no low relevance", async () => {
    // @ts-ignore access private method
    const summary = await (svc as any).summarizeLowRelevanceChunks([]);
    expect(summary).toBe("");
  });

  it("splitChunksByRelevance separates high and low relevance correctly", () => {
    process.env.PINECONE_TOP_K = "3"; // ensure topK matches test
    // @ts-ignore access private method
    const { highRelevance, lowRelevance } = (svc as any).splitChunksByRelevance(
      {
        matches: Array.from({ length: 3 }, (_, i) => ({
          metadata: { text: `text${i}` },
        })),
      }
    );

    expect(highRelevance.length).toBe(3);
    expect(lowRelevance.length).toBe(0);
  });
});

// ----------------------------------------
// Additional tests (Vitest) for VectorStoreService
// Library/Framework: Vitest
// ----------------------------------------
describe("VectorStoreService - additional scenarios", () => {
  let mockLLM: any;
  let mockVectorStore: any;
  let svc: VectorStoreService;
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    // Reset env each test for deterministic behavior
    process.env = { ...OLD_ENV };
    delete process.env.PINECONE_TOP_K;
    delete process.env.MAX_CONTEXT_TOKENS;

    mockLLM = {
      generateAnswerStream: vi.fn(async function* (_input: any) {
        yield "s1";
        yield "s2";
        yield "s3";
      }),
    };

    mockVectorStore = {
      upsertVectors: vi.fn(async (vectors: any[]) => ({
        upsertedCount: vectors.length,
      })),
      queryVector: vi.fn(async (_embedding: number[], _userId?: string, _fileId?: string, _topK?: number) => []),
    };

    class TestVectorStoreService extends VectorStoreService {
      constructor(llm: any, provider: string = "pinecone") {
        super(llm, provider);
        (this as any).vectorStore = mockVectorStore;
      }
    }

    svc = new TestVectorStoreService(mockLLM);
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("constructor: accepts different providers without throwing and wires vectorStore", () => {
    class TestPgSvc extends VectorStoreService {
      constructor(llm: any) {
        super(llm, "postgres");
        (this as any).vectorStore = mockVectorStore;
      }
    }
    const s1 = new TestPgSvc(mockLLM);
    // Smoke assertions
    expect(typeof (s1 as any).upsertVectors).toBe("function");
    expect(typeof (s1 as any).query).toBe("function");
  });

  it("upsertVectors: propagates errors from underlying vector store", async () => {
    mockVectorStore.upsertVectors.mockRejectedValueOnce(new Error("upsert failed"));
    await expect(svc.upsertVectors([{ id: "x", values: [0.1], metadata: {} }])).rejects.toThrow("upsert failed");
    expect(mockVectorStore.upsertVectors).toHaveBeenCalledTimes(1);
  });

  it("query: returns empty array when store has no matches", async () => {
    mockVectorStore.queryVector.mockResolvedValueOnce([]);
    const res = await svc.query([0.1, 0.2], "u", "f", 2);
    expect(res).toEqual([]);
    expect(mockVectorStore.queryVector).toHaveBeenCalledWith([0.1, 0.2], "u", "f", 2);
  });

  it("query: uses provided topK over env when specified", async () => {
    process.env.PINECONE_TOP_K = "5";
    await svc.query([0.3, 0.4], "u1", "f1", 7);
    expect(mockVectorStore.queryVector).toHaveBeenCalledWith([0.3, 0.4], "u1", "f1", 7);
  });

  it("query: falls back to env PINECONE_TOP_K when topK not provided", async () => {
    process.env.PINECONE_TOP_K = "4";
    await svc.query([0.3, 0.4], "u2", "f2");
    // If implementation defaults to env, we assert value 4 went through
    expect(mockVectorStore.queryVector).toHaveBeenCalledWith([0.3, 0.4], "u2", "f2", 4);
  });

  it("getContextWithSummarization: returns only high relevance when there are no low relevance chunks", async () => {
    process.env.PINECONE_TOP_K = "3";
    const results = {
      matches: [
        { metadata: { text: "H1" } },
        { metadata: { text: "H2" } },
        { metadata: { text: "H3" } },
      ],
    };
    const ctx = await svc.getContextWithSummarization(results);
    expect(ctx).toContain("H1");
    expect(ctx).toContain("H2");
    expect(ctx).toContain("H3");
    expect(mockLLM.generateAnswerStream).not.toHaveBeenCalled();
  });

  it("getContextWithSummarization: handles when LLM generateAnswerStream throws (returns high relevance only)", async () => {
    process.env.PINECONE_TOP_K = "1";
    mockLLM.generateAnswerStream.mockImplementationOnce(async function* () {
      yield "";
      throw new Error("llm failure");
    });
    const results = {
      matches: [
        { metadata: { text: "HIGH" } },
        { metadata: { text: "LOW-A" } },
        { metadata: { text: "LOW-B" } },
      ],
    };
    const ctx = await svc.getContextWithSummarization(results);
    expect(ctx).toContain("HIGH");
    // In failure, summarization tokens are not appended
    expect(ctx).not.toContain("LOW-A");
    expect(ctx).not.toContain("LOW-B");
  });

  it("getContextWithSummarization: respects MAX_CONTEXT_TOKENS hard cap across high+summary", async () => {
    process.env.PINECONE_TOP_K = "1";
    process.env.MAX_CONTEXT_TOKENS = "60";
    // Big texts to force truncation behavior
    const big = "X".repeat(500);
    const results = {
      matches: [
        { metadata: { text: big } }, // high
        { metadata: { text: big } }, // low
      ],
    };
    const ctx = await svc.getContextWithSummarization(results);
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeLessThanOrEqual(1000); // sanity: should be truncated well below raw total
  });

  it("summarizeLowRelevanceChunks: builds summary from multiple chunks via streaming tokens", async () => {
    // @ts-ignore
    const out = await (svc as any).summarizeLowRelevanceChunks([
      { metadata: { text: "alpha" } },
      { metadata: { text: "beta" } },
      { metadata: { text: "gamma" } },
    ]);
    expect(out).toContain("s1");
    expect(out).toContain("s2");
    expect(out).toContain("s3");
    expect(mockLLM.generateAnswerStream).toHaveBeenCalledTimes(1);
  });

  it("splitChunksByRelevance: preserves order and splits using env topK default when unset in call sites", () => {
    process.env.PINECONE_TOP_K = "2";
    // @ts-ignore
    const { highRelevance, lowRelevance } = (svc as any).splitChunksByRelevance({
      matches: [
        { metadata: { text: "t0" } },
        { metadata: { text: "t1" } },
        { metadata: { text: "t2" } },
        { metadata: { text: "t3" } },
      ],
    });

    expect(highRelevance.map((c: any) => c.metadata.text)).toEqual(["t0", "t1"]);
    expect(lowRelevance.map((c: any) => c.metadata.text)).toEqual(["t2", "t3"]);
  });

  it("getContextWithSummarization: ignores non-string metadata.text safely", async () => {
    process.env.PINECONE_TOP_K = "1";
    const results = {
      matches: [
        { metadata: { text: "OK" } },
        { metadata: { text: 12345 } }, // unexpected input
        { metadata: { text: null } },  // unexpected input
      ],
    };
    const ctx = await svc.getContextWithSummarization(results);
    expect(ctx).toContain("OK");
    // Should not throw; non-string entries are ignored or stringified by implementation
    expect(typeof ctx).toBe("string");
  });

  it("query: handles missing optional identifiers (userId/fileId) gracefully", async () => {
    await svc.query([0.9, 0.8]);
    // When undefined, implementation should either pass through undefined or default
    const args = mockVectorStore.queryVector.mock.calls[0];
    expect(args[0]).toEqual([0.9, 0.8]);
    expect(args[1]).toBeUndefined();
    expect(args[2]).toBeUndefined();
  });
});