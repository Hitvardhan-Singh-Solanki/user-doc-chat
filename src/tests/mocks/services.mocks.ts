/**
 * Service layer mocks
 * Provides mocks for all service classes
 */

import { vi } from 'vitest';
import type {
  AuthServiceMock,
  LLMServiceMock,
  FileServiceMock,
  VectorServiceMock,
  MockFactory,
} from '../../shared/types/mock.types';

// Auth Service Mock Factory
export const createAuthServiceMock = (): AuthServiceMock => ({
  signUp: vi.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    token: 'mock-jwt-token',
  }),
  login: vi.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    token: 'mock-jwt-token',
  }),
  verifyToken: vi.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
  }),
  refreshToken: vi.fn().mockResolvedValue({
    token: 'new-mock-jwt-token',
  }),
  logout: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn().mockResolvedValue(undefined),
});

// LLM Service Mock Factory
export const createLLMServiceMock = (): LLMServiceMock => ({
  generateResponse: vi.fn().mockResolvedValue({
    content: 'Mock AI response',
    usage: { total_tokens: 100 },
  }),
  generateStream: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield { content: 'Mock', done: false };
      yield { content: ' AI', done: false };
      yield { content: ' response', done: true };
    },
  }),
  extractFeatures: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
  summarizeText: vi.fn().mockResolvedValue('Mock summary of the text'),
  embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
});

// File Service Mock Factory
export const createFileServiceMock = (): FileServiceMock => ({
  uploadFile: vi.fn().mockResolvedValue({
    id: 'file-123',
    key: 'mock-file-key',
    url: 'https://mock-bucket.s3.amazonaws.com/mock-file-key',
  }),
  downloadFile: vi.fn().mockResolvedValue(Buffer.from('mock file content')),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  processFile: vi.fn().mockResolvedValue({
    text: 'Extracted text from file',
    metadata: { size: 1024, type: 'text/plain' },
  }),
  sanitizeFile: vi.fn().mockResolvedValue({
    sanitized: true,
    originalSize: 1024,
    sanitizedSize: 1000,
  }),
});

// Vector Service Mock Factory
export const createVectorServiceMock = (): VectorServiceMock => ({
  upsertVectors: vi.fn().mockResolvedValue({
    upsertedCount: 1,
    failedCount: 0,
  }),
  queryVectors: vi.fn().mockResolvedValue({
    matches: [
      {
        id: 'vector-123',
        score: 0.95,
        metadata: { text: 'Mock vector content' },
      },
    ],
  }),
  deleteVectors: vi.fn().mockResolvedValue({
    deletedCount: 1,
  }),
  createIndex: vi.fn().mockResolvedValue({
    name: 'mock-index',
    dimension: 384,
  }),
  deleteIndex: vi.fn().mockResolvedValue(undefined),
});

// Service Mock Factory Builder
export class ServiceMockFactory<T> implements MockFactory<T> {
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

// Pre-configured service mock instances
export const serviceMocks = {
  auth: createAuthServiceMock(),
  llm: createLLMServiceMock(),
  file: createFileServiceMock(),
  vector: createVectorServiceMock(),
};

// Service mock builders
export const authServiceMockBuilder = new ServiceMockFactory(serviceMocks.auth);
export const llmServiceMockBuilder = new ServiceMockFactory(serviceMocks.llm);
export const fileServiceMockBuilder = new ServiceMockFactory(serviceMocks.file);
export const vectorServiceMockBuilder = new ServiceMockFactory(
  serviceMocks.vector,
);
