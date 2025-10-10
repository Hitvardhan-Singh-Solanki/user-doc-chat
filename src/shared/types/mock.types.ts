/**
 * Mock factory types and interfaces for testing
 * Provides type-safe mock creation and management
 */

import type { Mock } from 'vitest';

// Base mock factory interface
export interface MockFactory<T> {
  create(): T;
  createWith(overrides: Partial<T>): T;
  createArray(count: number): T[];
  createArrayWith(count: number, overrides: Partial<T>): T[];
}

// Database mock types
export interface DatabaseMock {
  query: Mock;
  withTransaction: Mock;
  connect: Mock;
  release: Mock;
  begin: Mock;
  commit: Mock;
  rollback: Mock;
}

export interface RedisMock {
  get: Mock;
  set: Mock;
  del: Mock;
  exists: Mock;
  expire: Mock;
  lPush: Mock;
  rPush: Mock;
  lRange: Mock;
  lTrim: Mock;
  hGet: Mock;
  hSet: Mock;
  hDel: Mock;
  publish: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
  quit: Mock;
  disconnect: Mock;
}

export interface MinioMock {
  putObject: Mock;
  getObject: Mock;
  removeObject: Mock;
  listObjects: Mock;
  bucketExists: Mock;
  makeBucket: Mock;
  removeBucket: Mock;
}

// Service mock types
export interface AuthServiceMock {
  signUp: Mock;
  login: Mock;
  verifyToken: Mock;
  refreshToken: Mock;
  logout: Mock;
  changePassword: Mock;
}

export interface LLMServiceMock {
  generateResponse: Mock;
  generateStream: Mock;
  extractFeatures: Mock;
  summarizeText: Mock;
  embedText: Mock;
}

export interface FileServiceMock {
  uploadFile: Mock;
  downloadFile: Mock;
  deleteFile: Mock;
  processFile: Mock;
  sanitizeFile: Mock;
}

export interface VectorServiceMock {
  upsertVectors: Mock;
  queryVectors: Mock;
  deleteVectors: Mock;
  createIndex: Mock;
  deleteIndex: Mock;
}

// External API mock types
export interface HuggingFaceMock {
  featureExtraction: Mock;
  chatCompletion: Mock;
  chatCompletionStream: Mock;
  textGeneration: Mock;
  textGenerationStream: Mock;
}

export interface PineconeMock {
  upsert: Mock;
  query: Mock;
  delete: Mock;
  fetch: Mock;
  update: Mock;
  listIndexes: Mock;
  createIndex: Mock;
  deleteIndex: Mock;
}

// Middleware mock types
export interface AuthMiddlewareMock {
  authenticate: Mock;
  authorize: Mock;
  validateToken: Mock;
}

export interface RateLimitMock {
  checkLimit: Mock;
  consume: Mock;
  reset: Mock;
  getInfo: Mock;
}

// Queue mock types
export interface BullMQMock {
  add: Mock;
  process: Mock;
  getJobs: Mock;
  clean: Mock;
  close: Mock;
  pause: Mock;
  resume: Mock;
}

// Memory tracking types
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

export interface MemoryLeakDetection {
  baseline: MemorySnapshot;
  current: MemorySnapshot;
  difference: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  isLeak: boolean;
  threshold: number;
}

// Performance test types
export interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  memoryBefore: MemorySnapshot;
  memoryAfter: MemorySnapshot;
  memoryDelta: number;
}

export interface QueryPerformanceMetrics extends PerformanceMetrics {
  query: string;
  parameters?: unknown[];
  rowsReturned: number;
  executionTime: number;
}

export interface BlockingOperationResult {
  operation: string;
  duration: number;
  isBlocking: boolean;
  threshold: number;
  details: Record<string, unknown>;
}

// Test container types
export interface ContainerConfig {
  image: string;
  tag: string;
  ports: number[];
  environment: Record<string, string>;
  volumes?: Array<{
    source: string;
    target: string;
  }>;
  healthCheck?: {
    test: string[];
    interval: number;
    timeout: number;
    retries: number;
  };
}

export interface ContainerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  getConnectionString(): string;
  getPort(port: number): number;
  isHealthy(): Promise<boolean>;
  getLogs(): string;
}

// Mock cleanup utilities
export interface MockCleanup {
  mocks: Set<Mock>;
  add(mock: Mock): void;
  clear(): void;
  restore(): void;
  reset(): void;
}

// Test fixture types
export interface TestFixture<T> {
  data: T;
  cleanup(): Promise<void>;
  reset(): Promise<void>;
}

export interface DatabaseFixture {
  users: TestFixture<Array<{ id: string; email: string; password: string }>>;
  chats: TestFixture<
    Array<{ id: string; userId: string; messages: unknown[] }>
  >;
  files: TestFixture<Array<{ id: string; userId: string; content: Buffer }>>;
  vectors: TestFixture<
    Array<{
      id: string;
      embedding: number[];
      metadata: Record<string, unknown>;
    }>
  >;
}

// Assertion helpers
export interface CustomAssertions {
  toHaveMemoryLeak(expectedThreshold?: number): void;
  toBeBlockingOperation(threshold?: number): void;
  toHaveValidConnection(): void;
  toHaveCleanResources(): void;
}

// Test environment types
export interface TestEnvironment {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
}
