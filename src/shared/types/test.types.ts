import { vi } from 'vitest';
import { Request, NextFunction } from 'express';
import { IDBStore } from '@interfaces/db-store.interface';
import { VectorStoreService } from '@vector/services/vector-store.service';
import { LLMService } from '@chat/services/llm.service';
import { SearchResult, EnrichmentOptions } from './index';
import type { RateLimiterService } from '../../infrastructure/cache/rate-limiter.service';

// Import types from other test type files for internal use
// import type { ContainerConfig, ContainerManager } from './mock.types';
// import type { MemoryMetrics, MemoryLeakResult } from './performance.types';
// import type { DatabaseContainer, RedisContainer } from './container.types';

export interface MockRequest extends Partial<Request> {
  ip?: string;
  headers: Record<string, string>;
  path: string;
  method: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  jsonData?: unknown;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (data: unknown) => void;
}

export interface MockNextFunction extends NextFunction {
  called: boolean;
  error?: Error;
}

export interface RateLimitError extends Error {
  remainingPoints: number;
  msBeforeNext: number;
}

export class RateLimitErrorImpl extends Error implements RateLimitError {
  remainingPoints: number;
  msBeforeNext: number;

  constructor(remainingPoints: number, msBeforeNext: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.remainingPoints = remainingPoints;
    this.msBeforeNext = msBeforeNext;

    // Restore prototype chain
    Object.setPrototypeOf(this, RateLimitErrorImpl.prototype);

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitErrorImpl);
    }
  }
}

export class RedisConnectionError extends Error {
  constructor(message: string = 'Redis connection error') {
    super(message);
    this.name = 'RedisConnectionError';

    // Restore prototype chain
    Object.setPrototypeOf(this, RedisConnectionError.prototype);

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RedisConnectionError);
    }
  }
}

export interface MockRateLimiterService extends RateLimiterService {
  initialize: () => Promise<void>;
  consumeGeneral: (key: string) => Promise<void>;
  consumeAuth: (key: string) => Promise<void>;
  consumeFileUpload: (key: string) => Promise<void>;
  consumeChat: (key: string) => Promise<void>;
  getRateLimitInfo: (
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ) => Promise<{
    remainingPoints: number;
    totalHits: number;
    msBeforeNext: number;
    isBlocked: boolean;
  }>;
  getRemainingPoints: (
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ) => Promise<number>;
  getTotalHits: (
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ) => Promise<number>;
  reset: (
    key: string,
    type: 'general' | 'auth' | 'upload' | 'chat',
  ) => Promise<void>;
  isRedisBackend: () => boolean;
}

export interface TestLogger {
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
  info: (data: Record<string, unknown>, message: string) => void;
}

// LLM Service Test Types
export interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface TextGenerationResponse {
  generated_text: string;
}

export type FeatureExtractionOutput = (number | number[] | number[][])[];

// WebSocket Service Test Types
export type WebsocketServiceWithPrivateMethods = {
  db: IDBStore;
  llmService: LLMService;
  pineconeService: VectorStoreService;
  processQuestion: (
    question: string,
    userId: string,
    fileId: string,
  ) => Promise<void>;
  appendChatHistory: (
    userId: string,
    fileId: string,
    message: string,
  ) => Promise<void>;
  getChatHistory: (userId: string, fileId: string) => Promise<string[]>;
  trimChatHistory: (
    userId: string,
    fileId: string,
    maxEntries?: number,
  ) => Promise<void>;
  getOrCreateChat: (userId: string, fileId?: string) => Promise<string>;
  appendChatMessage: (
    chatId: string,
    sender: 'user' | 'ai',
    message: string,
  ) => Promise<void>;
};

// Fetch Service Test Types
export type FetchHTMLServiceWithPrivateMethods = {
  fetchPageText: ReturnType<typeof vi.fn>;
  fetchExtract: ReturnType<typeof vi.fn>;
  validateUrlForSSRF: ReturnType<typeof vi.fn>;
  isPublicAddress: ReturnType<typeof vi.fn>;
  isPrivateAddress: ReturnType<typeof vi.fn>;
  fetchHTML: (
    results: SearchResult[],
    options?: EnrichmentOptions,
  ) => Promise<(string | undefined)[]>;
};
