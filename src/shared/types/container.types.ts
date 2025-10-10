/**
 * Testcontainer configuration types
 * Provides type-safe container management for integration tests
 */

import type { StartedTestContainer } from 'testcontainers';

// Base container configuration
export interface ContainerConfig {
  image: string;
  tag?: string;
  ports: number[];
  environment: Record<string, string>;
  volumes?: Array<{
    source: string;
    target: string;
    mode?: 'ro' | 'rw';
  }>;
  healthCheck?: HealthCheckConfig;
  command?: string[];
  workingDir?: string;
  user?: string;
  labels?: Record<string, string>;
  networkMode?: 'bridge' | 'host' | 'none';
}

export interface HealthCheckConfig {
  test: string[];
  interval: number; // seconds
  timeout: number; // seconds
  retries: number;
  startPeriod?: number; // seconds
}

// Database container types
export interface DatabaseContainerConfig extends ContainerConfig {
  database: string;
  user: string;
  password: string;
  initScripts?: string[];
  extensions?: string[];
}

export interface DatabaseContainer {
  container: StartedTestContainer;
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  isHealthy(): Promise<boolean>;
  executeSql(sql: string): Promise<void>;
  getLogs(): string;
}

// Redis container types
export interface RedisContainerConfig extends ContainerConfig {
  password?: string;
  maxmemory?: string;
  maxmemoryPolicy?: string;
  appendonly?: boolean;
  save?: string;
}

export interface RedisContainer {
  container: StartedTestContainer;
  connectionString: string;
  host: string;
  port: number;
  password?: string;
  isHealthy(): Promise<boolean>;
  executeCommand(command: string[]): Promise<string>;
  getLogs(): string;
}

// MinIO container types
export interface MinioContainerConfig extends ContainerConfig {
  accessKey: string;
  secretKey: string;
  defaultBucket?: string;
  region?: string;
}

export interface MinioContainer {
  container: StartedTestContainer;
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  region: string;
  isHealthy(): Promise<boolean>;
  createBucket(bucketName: string): Promise<void>;
  listBuckets(): Promise<string[]>;
  getLogs(): string;
}

// Container manager types
export interface ContainerManager {
  database?: DatabaseContainer;
  redis?: RedisContainer;
  minio?: MinioContainer;
  startAll(): Promise<void>;
  stopAll(): Promise<void>;
  isHealthy(): Promise<boolean>;
  getLogs(): Record<string, string>;
  cleanup(): Promise<void>;
}

// Container lifecycle hooks
export interface ContainerLifecycle {
  beforeStart?(): Promise<void>;
  afterStart?(): Promise<void>;
  beforeStop?(): Promise<void>;
  afterStop?(): Promise<void>;
  onError?(error: Error): Promise<void>;
}

// Container network configuration
export interface ContainerNetwork {
  name: string;
  driver: 'bridge' | 'host' | 'overlay' | 'macvlan';
  subnet?: string;
  gateway?: string;
  labels?: Record<string, string>;
}

// Container volume configuration
export interface ContainerVolume {
  name: string;
  driver: 'local' | 'nfs' | 'cifs';
  options?: Record<string, string>;
  labels?: Record<string, string>;
}

// Container orchestration types
export interface ContainerOrchestrator {
  startServices(services: string[]): Promise<void>;
  stopServices(services: string[]): Promise<void>;
  restartServices(services: string[]): Promise<void>;
  getServiceStatus(service: string): Promise<'running' | 'stopped' | 'error'>;
  getServiceLogs(service: string): Promise<string>;
  waitForHealthy(service: string, timeout?: number): Promise<boolean>;
}

// Container test environment
export interface ContainerTestEnvironment {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionString: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    connectionString: string;
  };
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    region: string;
    bucket: string;
  };
}

// Container cleanup utilities
export interface ContainerCleanup {
  containers: Set<StartedTestContainer>;
  networks: Set<string>;
  volumes: Set<string>;
  addContainer(container: StartedTestContainer): void;
  addNetwork(networkId: string): void;
  addVolume(volumeId: string): void;
  cleanup(): Promise<void>;
  forceCleanup(): Promise<void>;
}

// Container health monitoring
export interface ContainerHealthMonitor {
  containers: Map<string, StartedTestContainer>;
  healthChecks: Map<string, () => Promise<boolean>>;
  addContainer(
    name: string,
    container: StartedTestContainer,
    healthCheck?: () => Promise<boolean>,
  ): void;
  removeContainer(name: string): void;
  checkHealth(name: string): Promise<boolean>;
  checkAllHealth(): Promise<Record<string, boolean>>;
  waitForHealthy(name: string, timeout?: number): Promise<boolean>;
  waitForAllHealthy(timeout?: number): Promise<boolean>;
}

// Container performance monitoring
export interface ContainerPerformanceMonitor {
  startMonitoring(container: StartedTestContainer): void;
  stopMonitoring(container: StartedTestContainer): void;
  getMetrics(container: StartedTestContainer): {
    cpuUsage: number;
    memoryUsage: number;
    networkIO: { bytesIn: number; bytesOut: number };
    diskIO: { bytesRead: number; bytesWritten: number };
  };
  isResourceConstrained(container: StartedTestContainer): boolean;
  getRecommendations(container: StartedTestContainer): string[];
}
