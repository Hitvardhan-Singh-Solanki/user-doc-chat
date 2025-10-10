/**
 * Common mocks used across all modules
 * DRY principle: Shared mocks to avoid duplication
 */

import { vi } from 'vitest';
import type {
  DatabaseMock,
  RedisMock,
  MinioMock,
  BullMQMock,
  MockFactory,
} from '@types/mock.types';

// Database Mock Factory
export const createDatabaseMock = (): DatabaseMock => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  withTransaction: vi.fn().mockImplementation(async (fn) => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
    };
    return fn(mockClient);
  }),
  connect: vi.fn().mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
    begin: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
  }),
  release: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
});

// Redis Mock Factory
export const createRedisMock = (): RedisMock => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  lPush: vi.fn().mockResolvedValue(1),
  rPush: vi.fn().mockResolvedValue(1),
  lRange: vi.fn().mockResolvedValue([]),
  lTrim: vi.fn().mockResolvedValue('OK'),
  hGet: vi.fn().mockResolvedValue(null),
  hSet: vi.fn().mockResolvedValue(1),
  hDel: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
  subscribe: vi.fn().mockResolvedValue('OK'),
  unsubscribe: vi.fn().mockResolvedValue('OK'),
  quit: vi.fn().mockResolvedValue('OK'),
  disconnect: vi.fn().mockResolvedValue('OK'),
});

// MinIO Mock Factory
export const createMinioMock = (): MinioMock => ({
  putObject: vi.fn().mockResolvedValue({ etag: 'mock-etag' }),
  getObject: vi.fn().mockResolvedValue({
    pipe: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  }),
  removeObject: vi.fn().mockResolvedValue(undefined),
  listObjects: vi.fn().mockResolvedValue([]),
  bucketExists: vi.fn().mockResolvedValue(true),
  makeBucket: vi.fn().mockResolvedValue(undefined),
  removeBucket: vi.fn().mockResolvedValue(undefined),
});

// BullMQ Mock Factory
export const createBullMQMock = (): BullMQMock => ({
  add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  process: vi.fn().mockReturnValue({
    id: 'worker-123',
    close: vi.fn(),
    on: vi.fn(),
  }),
  getJobs: vi.fn().mockResolvedValue([]),
  clean: vi.fn().mockResolvedValue([]),
  close: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
});

// Generic Mock Factory Builder (DRY for repetitive mocks)
export class MockFactoryBuilder<T> implements MockFactory<T> {
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
      if (mockFn) {
        (result as any)[key] = mockFn();
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

// Common Mock Utilities
export class MockCleanup {
  private mocks: Set<ReturnType<typeof vi.fn>> = new Set();

  add(mock: ReturnType<typeof vi.fn>): void {
    this.mocks.add(mock);
  }

  clear(): void {
    this.mocks.forEach((mock) => mock.mockClear());
  }

  restore(): void {
    this.mocks.forEach((mock) => mock.mockRestore());
  }

  reset(): void {
    this.mocks.forEach((mock) => mock.mockReset());
  }

  cleanup(): void {
    this.clear();
    this.mocks.clear();
  }
}

// Mock Memory Tracking
export class MockMemoryTracker {
  private snapshots: Array<{
    name: string;
    timestamp: number;
    memory: NodeJS.MemoryUsage;
  }> = [];

  takeSnapshot(name: string): void {
    this.snapshots.push({
      name,
      timestamp: Date.now(),
      memory: process.memoryUsage(),
    });
  }

  getMemoryDelta(
    fromSnapshot: string,
    toSnapshot: string,
  ): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const from = this.snapshots.find((s) => s.name === fromSnapshot);
    const to = this.snapshots.find((s) => s.name === toSnapshot);

    if (!from || !to) {
      throw new Error(`Snapshot not found: ${fromSnapshot} or ${toSnapshot}`);
    }

    return {
      heapUsed: to.memory.heapUsed - from.memory.heapUsed,
      heapTotal: to.memory.heapTotal - from.memory.heapTotal,
      external: to.memory.external - from.memory.external,
      rss: to.memory.rss - from.memory.rss,
    };
  }

  detectLeak(threshold: number = 10 * 1024 * 1024): boolean {
    if (this.snapshots.length < 2) return false;

    const latest = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];

    const delta = this.getMemoryDelta(previous.name, latest.name);
    return delta.heapUsed > threshold;
  }

  getSnapshots(): typeof this.snapshots {
    return [...this.snapshots];
  }

  clear(): void {
    this.snapshots = [];
  }
}

// Mock Performance Monitor
export class MockPerformanceMonitor {
  private startTime: number = 0;
  private endTime: number = 0;
  private memoryStart: NodeJS.MemoryUsage | null = null;
  private memoryEnd: NodeJS.MemoryUsage | null = null;

  start(): void {
    this.startTime = performance.now();
    this.memoryStart = process.memoryUsage();
  }

  stop(): {
    duration: number;
    memoryDelta: number;
    memoryPeak: number;
  } {
    this.endTime = performance.now();
    this.memoryEnd = process.memoryUsage();

    return {
      duration: this.endTime - this.startTime,
      memoryDelta: this.memoryEnd.heapUsed - (this.memoryStart?.heapUsed || 0),
      memoryPeak: this.memoryEnd.heapUsed,
    };
  }

  isSlow(threshold: number = 100): boolean {
    return this.endTime - this.startTime > threshold;
  }
}

// Export commonly used mock instances
export const commonMocks = {
  database: createDatabaseMock(),
  redis: createRedisMock(),
  minio: createMinioMock(),
  bullmq: createBullMQMock(),
};

// Export cleanup utilities
export const mockCleanup = new MockCleanup();
export const memoryTracker = new MockMemoryTracker();
export const performanceMonitor = new MockPerformanceMonitor();
