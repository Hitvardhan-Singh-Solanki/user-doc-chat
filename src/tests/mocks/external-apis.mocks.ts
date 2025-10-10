/**
 * External API mocks
 * Provides mocks for third-party services (HuggingFace, Pinecone, etc.)
 */

import { vi } from 'vitest';
import type {
  HuggingFaceMock,
  PineconeMock,
  MockFactory,
} from '../../shared/types/mock.types';

// HuggingFace Mock Factory
export const createHuggingFaceMock = (): HuggingFaceMock => ({
  featureExtraction: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
  chatCompletion: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: 'Mock HuggingFace response',
          role: 'assistant',
        },
      },
    ],
    usage: {
      total_tokens: 50,
      prompt_tokens: 20,
      completion_tokens: 30,
    },
  }),
  chatCompletionStream: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield {
        choices: [
          {
            delta: { content: 'Mock', role: 'assistant' },
          },
        ],
      };
      yield {
        choices: [
          {
            delta: { content: ' HuggingFace', role: 'assistant' },
          },
        ],
      };
      yield {
        choices: [
          {
            delta: { content: ' response', role: 'assistant' },
          },
        ],
      };
    },
  }),
  textGeneration: vi.fn().mockResolvedValue({
    generated_text: 'Mock generated text from HuggingFace',
  }),
  textGenerationStream: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield { generated_text: 'Mock' };
      yield { generated_text: ' generated' };
      yield { generated_text: ' text' };
    },
  }),
});

// Pinecone Mock Factory
export const createPineconeMock = (): PineconeMock => ({
  upsert: vi.fn().mockResolvedValue({
    upsertedCount: 1,
    failedCount: 0,
  }),
  query: vi.fn().mockResolvedValue({
    matches: [
      {
        id: 'vector-123',
        score: 0.95,
        metadata: { text: 'Mock vector content' },
        values: [0.1, 0.2, 0.3, 0.4, 0.5],
      },
    ],
  }),
  delete: vi.fn().mockResolvedValue({
    deletedCount: 1,
  }),
  fetch: vi.fn().mockResolvedValue({
    vectors: {
      'vector-123': {
        id: 'vector-123',
        values: [0.1, 0.2, 0.3, 0.4, 0.5],
        metadata: { text: 'Mock vector content' },
      },
    },
  }),
  update: vi.fn().mockResolvedValue({
    updatedCount: 1,
  }),
  listIndexes: vi.fn().mockResolvedValue({
    indexes: [
      {
        name: 'mock-index',
        dimension: 384,
        metric: 'cosine',
        status: 'Ready',
      },
    ],
  }),
  createIndex: vi.fn().mockResolvedValue({
    name: 'mock-index',
    dimension: 384,
    metric: 'cosine',
  }),
  deleteIndex: vi.fn().mockResolvedValue(undefined),
});

// External API Mock Factory Builder
export class ExternalAPIMockFactory<T> implements MockFactory<T> {
  private defaultValues: T;
  private mockFunctions: Partial<Record<keyof T, () => unknown>>;

  constructor(
    defaultValues: T,
    mockFunctions?: Partial<Record<keyof T, () => unknown>>,
  ) {
    this.defaultValues = defaultValues;
    this.mockFunctions = mockFunctions || {};
  }

  create(): T {
    const result = { ...this.defaultValues };

    // Apply mock functions
    for (const [key, mockFn] of Object.entries(this.mockFunctions)) {
      if (mockFn && typeof mockFn === 'function') {
        (result as Record<string, unknown>)[key] = mockFn();
      }
    }

    return result;
  }

  createWith(overrides: Partial<T>): T {
    return { ...this.create(), ...overrides };
  }

  createArray(count: number): T[] {
    return Array.from({ length: count }, () => this.create());
  }

  createArrayWith(count: number, overrides: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.createWith(overrides));
  }
}

// Pre-configured external API mock instances
export const externalAPIMocks = {
  huggingface: createHuggingFaceMock(),
  pinecone: createPineconeMock(),
};

// External API mock builders
export const huggingFaceMockBuilder = new ExternalAPIMockFactory(
  externalAPIMocks.huggingface,
);
export const pineconeMockBuilder = new ExternalAPIMockFactory(
  externalAPIMocks.pinecone,
);

// Mock HTTP responses for external APIs
export const mockHTTPResponses = {
  huggingface: {
    featureExtraction: {
      status: 200,
      data: [0.1, 0.2, 0.3, 0.4, 0.5],
    },
    chatCompletion: {
      status: 200,
      data: {
        choices: [
          {
            message: {
              content: 'Mock HuggingFace response',
              role: 'assistant',
            },
          },
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 20,
          completion_tokens: 30,
        },
      },
    },
    textGeneration: {
      status: 200,
      data: {
        generated_text: 'Mock generated text from HuggingFace',
      },
    },
  },
  pinecone: {
    upsert: {
      status: 200,
      data: {
        upsertedCount: 1,
        failedCount: 0,
      },
    },
    query: {
      status: 200,
      data: {
        matches: [
          {
            id: 'vector-123',
            score: 0.95,
            metadata: { text: 'Mock vector content' },
            values: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        ],
      },
    },
    listIndexes: {
      status: 200,
      data: {
        indexes: [
          {
            name: 'mock-index',
            dimension: 384,
            metric: 'cosine',
            status: 'Ready',
          },
        ],
      },
    },
  },
};

// Mock error responses
export const mockErrorResponses = {
  rateLimit: {
    status: 429,
    data: {
      error: 'Rate limit exceeded',
      retry_after: 60,
    },
  },
  unauthorized: {
    status: 401,
    data: {
      error: 'Unauthorized',
      message: 'Invalid API key',
    },
  },
  notFound: {
    status: 404,
    data: {
      error: 'Not found',
      message: 'Resource not found',
    },
  },
  serverError: {
    status: 500,
    data: {
      error: 'Internal server error',
      message: 'Something went wrong',
    },
  },
};
