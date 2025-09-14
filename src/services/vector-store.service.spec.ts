import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VectorStoreService } from './vector-store.service';

describe('VectorStoreService', () => {
  let mockLLM: any;
  let mockVectorStore: any;
  let svc: VectorStoreService;

  beforeEach(() => {
    // Mock LLMService.generateAnswerStream as async generator
    mockLLM = {
      generateAnswerStream: vi.fn(async function* (_input: any) {
        yield 'token1';
        yield 'token2';
      }),
      generateLowSummaryStream: vi.fn(async function* (_input: any) {
        yield 'token1';
        yield 'token2';
      }),
      generateLowSummary: vi.fn(async (_input: any) => 'token1token2'),
    };

    // Mock Pinecone/Postgres vector store with upsert/query spies
    mockVectorStore = {
      upsertVectors: vi.fn(async (vectors: any[]) => ({
        upsertedCount: vectors.length, // match IVectorStore interface
      })),
      queryVector: vi.fn(async () => [
        { score: 0.9, metadata: { text: 'match1' } },
      ]),
    };

    // Subclass VectorStoreService to inject mockVectorStore
    class TestVectorStoreService extends VectorStoreService {
      constructor(llm: any) {
        super(llm, 'pinecone');
        // Override private vectorStore
        (this as any).vectorStore = mockVectorStore;
      }
    }

    svc = new TestVectorStoreService(mockLLM);
  });

  it('upsertVectors calls underlying vector store', async () => {
    const vectors = [{ id: '1', values: [0.1, 0.2], metadata: {} }];
    const res = await svc.upsertVectors(vectors);
    expect(mockVectorStore.upsertVectors).toHaveBeenCalledWith(vectors);
    expect(res.upsertedCount).toBe(1);
  });

  it('query calls underlying vector store', async () => {
    const embedding = [0.1, 0.2];
    const userId = 'user1';
    const fileId = 'file1';
    const topK = 3;
    const res = await svc.query(embedding, userId, fileId, topK);
    expect(mockVectorStore.queryVector).toHaveBeenCalledWith(
      embedding,
      userId,
      fileId,
      topK,
    );
    expect(res).toEqual([{ score: 0.9, metadata: { text: 'match1' } }]);
  });

  it('getContextWithSummarization returns concatenated high relevance and summarized low relevance chunks', async () => {
    const results = {
      matches: [
        { metadata: { text: 'high1' } },
        { metadata: { text: 'high2' } },
        { metadata: { text: 'low1' } },
        { metadata: { text: 'low2' } },
      ],
    };

    // Set topK=2 so first two are high relevance
    process.env.PINECONE_TOP_K = '2';
    const context = await svc.getContextWithSummarization(results);

    expect(context).toContain('high1');
    expect(context).toContain('high2');
    expect(mockLLM.generateLowSummary).toHaveBeenCalled();
    expect(context).toContain('token1token2');
  });

  it('getContextWithSummarization respects maxContextTokens', async () => {
    const results = {
      matches: Array.from({ length: 10 }, (_, i) => ({
        metadata: { text: 'A'.repeat(500) },
      })),
    };

    process.env.MAX_CONTEXT_TOKENS = '50'; // small to trigger token limit
    const context = await svc.getContextWithSummarization(results);

    // Token limit should truncate some chunks
    expect(context.length).toBeLessThan(5000);
  });

  it('summarizeLowRelevanceChunks returns empty string when no low relevance', async () => {
    // accessing private method for testing
    const summary = await (svc as any).summarizeLowRelevanceChunks([]);
    expect(summary).toBe('');
  });

  it('splitChunksByRelevance separates high and low relevance correctly', () => {
    process.env.PINECONE_TOP_K = '3'; // ensure topK matches test
    //  accessing private method for testing
    const { highRelevance, lowRelevance } = (svc as any).splitChunksByRelevance(
      {
        matches: Array.from({ length: 3 }, (_, i) => ({
          metadata: { text: `text${i}` },
        })),
      },
    );

    expect(highRelevance.length).toBe(3);
    expect(lowRelevance.length).toBe(0);
  });
});
