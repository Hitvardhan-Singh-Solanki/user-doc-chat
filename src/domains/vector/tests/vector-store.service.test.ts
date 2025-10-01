import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VectorStoreService } from '../services/vector-store.service';
import {
  VectorQueryResult,
  QueryMatch,
} from '../../../shared/interfaces/vector-store.interface';

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
      queryVector: vi.fn(
        async (): Promise<VectorQueryResult> => ({
          matches: [{ id: '1', score: 0.9, metadata: { text: 'match1' } }],
        }),
      ),
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
    expect(res).toEqual({
      matches: [{ id: '1', score: 0.9, metadata: { text: 'match1' } }],
    });
  });

  it('getContextWithSummarization returns concatenated high relevance and summarized low relevance chunks', async () => {
    const results: VectorQueryResult = {
      matches: [
        { id: '1', score: 0.9, metadata: { text: 'high1' } },
        { id: '2', score: 0.8, metadata: { text: 'high2' } },
        { id: '3', score: 0.7, metadata: { text: 'low1' } },
        { id: '4', score: 0.6, metadata: { text: 'low2' } },
      ],
    };

    // Pass topK=2 so first two are high relevance
    const context = await svc.getContextWithSummarization(results, 2);

    expect(context).toContain('high1');
    expect(context).toContain('high2');
    expect(mockLLM.generateLowSummary).toHaveBeenCalled();
    expect(context).toContain('token1token2');
  });

  it('getContextWithSummarization respects maxContextTokens', async () => {
    const results: VectorQueryResult = {
      matches: Array.from({ length: 10 }, (_, i) => ({
        id: `id-${i}`,
        score: 0.9 - i * 0.1,
        metadata: { text: 'A'.repeat(500) },
      })),
    };

    // Save original value and restore after test
    const originalMaxContextTokens = process.env.MAX_CONTEXT_TOKENS;
    try {
      process.env.MAX_CONTEXT_TOKENS = '50'; // small to trigger token limit
      const context = await svc.getContextWithSummarization(results, 5);

      // Token limit should truncate some chunks
      expect(context.length).toBeLessThan(5000);
    } finally {
      // Restore original value
      if (originalMaxContextTokens === undefined) {
        delete process.env.MAX_CONTEXT_TOKENS;
      } else {
        process.env.MAX_CONTEXT_TOKENS = originalMaxContextTokens;
      }
    }
  });

  it('summarizeLowRelevanceChunks returns empty string when no low relevance', async () => {
    // accessing private method for testing
    const summary = await (svc as any).summarizeLowRelevanceChunks([]);
    expect(summary).toBe('');
  });

  it('splitChunksByRelevance separates high and low relevance correctly', () => {
    // accessing private method for testing
    const { highRelevance, lowRelevance } = (svc as any).splitChunksByRelevance(
      {
        matches: Array.from({ length: 3 }, (_, i) => ({
          id: `id-${i}`,
          score: 0.9 - i * 0.1,
          metadata: { text: `text${i}` },
        })),
      },
      3, // topK parameter
    );

    expect(highRelevance.length).toBe(3);
    expect(lowRelevance.length).toBe(0);
  });
});
