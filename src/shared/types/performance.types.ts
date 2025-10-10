/**
 * Performance test result types
 * Provides comprehensive performance monitoring and analysis
 */

// Memory performance types
export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  timestamp: number;
}

export interface MemoryLeakResult {
  baseline: MemoryMetrics;
  afterTest: MemoryMetrics;
  afterCleanup: MemoryMetrics;
  leakDetected: boolean;
  leakSize: number;
  threshold: number;
  details: {
    heapGrowth: number;
    externalGrowth: number;
    rssGrowth: number;
  };
}

// Database performance types
export interface DatabasePerformanceMetrics {
  connectionTime: number;
  queryTime: number;
  transactionTime: number;
  connectionPoolSize: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  queryCount: number;
  slowQueries: Array<{
    query: string;
    duration: number;
    parameters?: unknown[];
  }>;
}

export interface QueryPerformanceResult {
  query: string;
  parameters?: unknown[];
  executionTime: number;
  rowsReturned: number;
  isSlow: boolean;
  slowThreshold: number;
  memoryBefore: MemoryMetrics;
  memoryAfter: MemoryMetrics;
  memoryDelta: number;
}

// Redis performance types
export interface RedisPerformanceMetrics {
  connectionTime: number;
  operationTime: number;
  commandCount: number;
  slowCommands: Array<{
    command: string;
    duration: number;
    args?: unknown[];
  }>;
  memoryUsage: number;
  keyCount: number;
  hitRate: number;
}

// File processing performance types
export interface FileProcessingMetrics {
  fileSize: number;
  processingTime: number;
  memoryPeak: number;
  chunksProcessed: number;
  bytesProcessed: number;
  throughput: number; // bytes per second
}

// Vector operations performance types
export interface VectorPerformanceMetrics {
  embeddingTime: number;
  searchTime: number;
  indexSize: number;
  vectorCount: number;
  dimensions: number;
  similarityThreshold: number;
  resultsCount: number;
}

// Concurrent operations performance types
export interface ConcurrencyMetrics {
  concurrentRequests: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  throughput: number; // requests per second
  errorRate: number;
}

// Resource usage types
export interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  fileDescriptors: number;
  networkConnections: number;
  timers: number;
  intervals: number;
  eventListeners: number;
}

export interface ResourceLeakResult {
  beforeTest: ResourceUsage;
  afterTest: ResourceUsage;
  afterCleanup: ResourceUsage;
  leakDetected: boolean;
  leakedResources: {
    fileDescriptors: number;
    networkConnections: number;
    timers: number;
    intervals: number;
    eventListeners: number;
  };
}

// Performance test configuration
export interface PerformanceTestConfig {
  duration: number; // test duration in milliseconds
  concurrency: number; // number of concurrent operations
  iterations: number; // number of iterations
  warmupIterations: number; // warmup iterations
  memoryThreshold: number; // memory leak threshold in bytes
  responseTimeThreshold: number; // response time threshold in milliseconds
  cpuThreshold: number; // CPU usage threshold percentage
}

// Performance test result
export interface PerformanceTestResult {
  testName: string;
  config: PerformanceTestConfig;
  metrics: {
    memory: MemoryMetrics;
    database?: DatabasePerformanceMetrics;
    redis?: RedisPerformanceMetrics;
    fileProcessing?: FileProcessingMetrics;
    vector?: VectorPerformanceMetrics;
    concurrency?: ConcurrencyMetrics;
    resources: ResourceUsage;
  };
  leaks: {
    memory?: MemoryLeakResult;
    resources?: ResourceLeakResult;
  };
  blocking: {
    operations: Array<{
      operation: string;
      duration: number;
      isBlocking: boolean;
      threshold: number;
    }>;
  };
  summary: {
    passed: boolean;
    score: number; // 0-100 performance score
    recommendations: string[];
  };
}

// Benchmark comparison types
export interface BenchmarkComparison {
  baseline: PerformanceTestResult;
  current: PerformanceTestResult;
  regression: {
    memory: number; // percentage change
    performance: number; // percentage change
    throughput: number; // percentage change
  };
  isRegression: boolean;
  threshold: number; // regression threshold percentage
}

// Performance monitoring utilities
export interface PerformanceMonitor {
  start(): void;
  stop(): PerformanceTestResult;
  getCurrentMetrics(): {
    memory: MemoryMetrics;
    resources: ResourceUsage;
  };
  isHealthy(): boolean;
  getRecommendations(): string[];
}

// Performance test suite configuration
export interface PerformanceTestSuite {
  name: string;
  tests: Array<{
    name: string;
    config: PerformanceTestConfig;
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
  }>;
  globalSetup?: () => Promise<void>;
  globalTeardown?: () => Promise<void>;
  thresholds: {
    memory: number;
    responseTime: number;
    throughput: number;
  };
}
