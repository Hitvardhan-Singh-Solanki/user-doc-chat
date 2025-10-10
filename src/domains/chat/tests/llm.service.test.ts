import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { PromptService } from '../services/prompt.service';
import type { IEnrichmentService } from '@interfaces/enrichment.interface';
import type { LLMService as LLMServiceType } from '../services/llm.service';

vi.doMock('@secrets', () => ({
  secretsManager: {
    getHuggingfaceToken: vi.fn().mockReturnValue('test-huggingface-token'),
    getJwtSecret: vi
      .fn()
      .mockReturnValue('7v56BQvL5hcwyvGqYbKlpzFieI6ofF0Bo+FqbyAW7yk='),
    getPineconeApiKey: vi.fn().mockReturnValue('test-pinecone-api-key'),
    getMinioAccessKey: vi.fn().mockReturnValue('test-minio-access-key'),
    getMinioSecretKey: vi.fn().mockReturnValue('test-minio-secret-key'),
    getPostgresPassword: vi.fn().mockReturnValue('test-postgres-password'),
    getRedisPassword: vi.fn().mockReturnValue(undefined),
    getSanitizerHost: vi.fn().mockReturnValue(undefined),
    getSanitizerTimeout: vi.fn().mockReturnValue(undefined),
    getSanitizerConfig: vi.fn().mockReturnValue({
      host: 'localhost:50051',
      timeout: 5000,
    }),
  },
}));

function asyncIterableFromArray<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async (): Promise<IteratorResult<T>> => {
          if (i >= items.length) {
            return { done: true, value: undefined };
          }
          const v = items[i++];
          return { done: false, value: v };
        },
      };
    },
  };
}

interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface TextGenerationResponse {
  generated_text: string;
}

type FeatureExtractionOutput = (number | number[] | number[][])[];

const HF = {
  featureExtraction: vi
    .fn<() => Promise<FeatureExtractionOutput>>()
    .mockResolvedValue([]),
  chatCompletionStream: vi
    .fn<() => AsyncIterable<ChatCompletionChunk>>()
    .mockReturnValue(asyncIterableFromArray<ChatCompletionChunk>([])),
  chatCompletion: vi
    .fn<() => Promise<ChatCompletionResponse>>()
    .mockResolvedValue({
      choices: [{ message: { content: 'Hello world.' } }],
    }),
  textGeneration: vi
    .fn<() => Promise<TextGenerationResponse | string>>()
    .mockResolvedValue({
      generated_text: 'Generated text response',
    }),
};

vi.mock('@huggingface/inference', () => ({
  InferenceClient: function (_token: string) {
    return {
      featureExtraction: HF.featureExtraction,
      chatCompletionStream: HF.chatCompletionStream,
      chatCompletion: HF.chatCompletion,
      textGeneration: HF.textGeneration,
    };
  },
}));

vi.mock('@xenova/transformers', () => ({
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue({
      encode: (text: string) => text.split(' ').map((_, i) => i + 1),
    }),
  },
}));

vi.mock('../../../infrastructure/external-services/ai/xenova.adapter', () => ({
  XenovaTokenizerAdapter: class MockXenovaTokenizerAdapter {
    constructor(private modelName: string) {}

    async init() {
      return Promise.resolve();
    }

    encode(text: string): number[] {
      return text.split(' ').map((_, i) => i + 1);
    }

    decode(tokens: number[]): string {
      return tokens.map((t) => `token${t}`).join(' ');
    }

    countTokens(text: string): number {
      return this.encode(text).length;
    }
  },
}));

let LLMService: typeof import('../services/llm.service').LLMService;

describe('LLMService (unit)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeAll(async () => {
    const mod = await import('../services/llm.service');
    LLMService = mod.LLMService;
  });

  beforeEach(() => {
    HF.featureExtraction.mockReset();
    HF.chatCompletionStream.mockReset();
    HF.chatCompletion.mockReset();
    HF.textGeneration.mockReset();

    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  async function createInitializedService(): Promise<LLMServiceType> {
    const svc = new LLMService();
    await svc['tokenizerReady'];
    svc['hfToken'] = 'test-token';
    svc['hfEmbeddingModel'] = 'test-embedding-model';
    svc['hfChatModel'] = 'test-chat-model';
    svc['hfSummaryModel'] = 'test-summary-model';
    return svc;
  }

  it('chunkText splits text with overlap correctly', async () => {
    const svc = await createInitializedService();
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const chunks = svc.chunkText(text, 10, 3);
    expect(chunks[0]).toBe(text.slice(0, 10));
    expect(chunks[1]).toBe(text.slice(7, 17));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('chunkText returns single chunk when shorter than chunkSize', async () => {
    const svc = await createInitializedService();
    const short = 'short';
    const chunks = svc.chunkText(short, 50, 10);
    expect(chunks).toEqual([short]);
  });

  it('embeddingPython throws when PYTHON_LLM_URL not set', async () => {
    const svc = await createInitializedService();
    svc['pythonUrl'] = undefined;

    await expect(svc.embeddingPython('hello')).rejects.toThrow(
      'PYTHON_LLM_URL environment variable is not set',
    );
  });

  it('embeddingPython calls fetch and returns embedding on success (and uses sanitizeText)', async () => {
    const sanitizeSpy = vi.spyOn(PromptService.prototype, 'sanitizeText');
    const svc = await createInitializedService();
    const fakeEmbedding = [0.1, 0.2, 0.3];

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const emb = await svc.embeddingPython(' some text ');

    expect(sanitizeSpy).toHaveBeenCalled();
    expect(emb).toEqual(fakeEmbedding);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/embed',
      expect.objectContaining({ method: 'POST' }),
    );
    sanitizeSpy.mockRestore();
  });

  it('embeddingPython throws when fetch returns non-ok', async () => {
    const svc = await createInitializedService();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'ERR',
      text: async () => 'internal error',
    });

    await expect(svc.embeddingPython('x')).rejects.toThrow(
      /Python embed API request failed/,
    );
  });

  it('getEmbedding handles flat and nested array replies', async () => {
    const svc = await createInitializedService();
    await svc['circuitBreakerReady'];

    HF.featureExtraction.mockResolvedValue([1, 2, 3]);
    const emb1 = await svc.getEmbedding('text');
    expect(emb1).toEqual([1, 2, 3]);

    HF.featureExtraction.mockResolvedValue([[4, 5, 6]]);
    const emb2 = await svc.getEmbedding('text2');
    expect(emb2).toEqual([4, 5, 6]);

    HF.featureExtraction.mockResolvedValue([
      ['invalid', 'data'] as unknown as number[],
    ]);
    await expect(svc.getEmbedding('bad')).rejects.toThrow();
  });

  it('generateAnswerStream yields tokens correctly', async () => {
    const svc = await createInitializedService();

    const chunks: ChatCompletionChunk[] = [
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: 'world.' } }] },
    ];
    HF.chatCompletionStream.mockReturnValue(asyncIterableFromArray(chunks));

    const userInput = { question: 'Q1', context: 'ctx', chatHistory: [] };
    const got: string[] = [];
    for await (const t of svc.generateAnswerStream(userInput)) {
      got.push(t);
    }

    expect(got.join('')).toBe('Hello world.');
    expect(HF.chatCompletionStream).toHaveBeenCalled();
  });

  it('generateAnswerStreamWithEnrichment yields tokens with enriched context', async () => {
    const svc = await createInitializedService();

    const chunks: ChatCompletionChunk[] = [
      { choices: [{ delta: { content: 'Enriched ' } }] },
      { choices: [{ delta: { content: 'answer.' } }] },
    ];
    HF.chatCompletionStream.mockReturnValue(asyncIterableFromArray(chunks));

    const userInput = { question: 'What is X?', context: '', chatHistory: [] };
    const enrichedContext = 'Additional context from web search';

    const tokens: string[] = [];
    for await (const t of svc.generateAnswerStreamWithEnrichment(
      userInput,
      enrichedContext,
    )) {
      tokens.push(t);
    }

    expect(tokens.join('')).toBe('Enriched answer.');
    expect(HF.chatCompletionStream).toHaveBeenCalled();
  });

  it('buildPrompt and buildLowPrompt call underlying prompt utilities', async () => {
    const svc = await createInitializedService();

    const p = await svc.buildPrompt('ctx', 'q', []);
    const lp = await svc.buildLowPrompt(['a', 'b']);
    expect(typeof p).toBe('string');
    expect(typeof lp).toBe('string');
  });

  it('generateLowSummary returns summary text', async () => {
    const svc = await createInitializedService();

    HF.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Summary of content' } }],
    });

    const result = await svc.generateLowSummary(['content1', 'content2']);
    expect(result).toBe('Summary of content');
    expect(HF.chatCompletion).toHaveBeenCalled();
  });

  it('generateText returns generated text', async () => {
    const svc = await createInitializedService();

    HF.textGeneration.mockResolvedValue({
      generated_text: 'Generated response',
    });

    const result = await svc.generateText('test prompt');
    expect(result).toBe('Generated response');
    expect(HF.textGeneration).toHaveBeenCalled();
  });

  it('generateText handles string response', async () => {
    const svc = await createInitializedService();

    HF.textGeneration.mockResolvedValue('Direct string response');

    const result = await svc.generateText('test prompt');
    expect(result).toBe('Direct string response');
  });

  it('enrichmentService setter works correctly', async () => {
    const svc = await createInitializedService();

    const mockEnrichmentService: IEnrichmentService = {
      enrichIfUnknown: vi.fn(),
      searchAndEmbed: vi.fn(),
    };

    svc.enrichmentService = mockEnrichmentService;
    expect(svc['_enrichmentService']).toBe(mockEnrichmentService);
  });
});
