/**
 * Service-related types and interfaces
 */

export interface RateLimiterConfig {
  points: number;
  duration: number;
  blockDuration: number;
}

export interface RateLimiterServiceConfig {
  general: RateLimiterConfig;
  auth: RateLimiterConfig;
  fileUpload: RateLimiterConfig;
  chat: RateLimiterConfig;
}

export interface RateLimitInfo {
  remainingPoints: number;
  totalHits: number;
  msBeforeNext: number;
  isBlocked: boolean;
}

export interface RateLimiterType {
  general: 'general';
  auth: 'auth';
  upload: 'upload';
  chat: 'chat';
}

export interface ServiceInitializationResult {
  success: boolean;
  error?: string;
  serviceName: string;
}

export interface ServiceHealthCheck {
  isHealthy: boolean;
  lastCheck: Date;
  error?: string;
  metrics?: Record<string, unknown>;
}

export interface ServiceMetrics {
  requests: number;
  errors: number;
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface ServiceConfiguration {
  name: string;
  version: string;
  environment: string;
  config: Record<string, unknown>;
}

export interface ServiceDependency {
  name: string;
  type: 'database' | 'cache' | 'queue' | 'storage' | 'external';
  isRequired: boolean;
  healthCheck: () => Promise<boolean>;
}

export interface ServiceRegistry {
  services: Map<string, ServiceConfiguration>;
  dependencies: Map<string, ServiceDependency[]>;
  healthChecks: Map<string, ServiceHealthCheck>;
}

export interface ServiceFactory<T> {
  create(): T;
  createWith(config: Partial<T>): T;
  destroy(instance: T): Promise<void>;
}

export interface ServiceLifecycle {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export interface ServiceError {
  code: string;
  message: string;
  service: string;
  timestamp: Date;
  stack?: string;
}

export interface ServiceEvent {
  type: 'start' | 'stop' | 'error' | 'health_check';
  service: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export type RateLimiterTypeKey = 'general' | 'auth' | 'upload' | 'chat';
export type ServiceStatus = 'initializing' | 'running' | 'stopped' | 'error';
export type ServiceType =
  | 'database'
  | 'cache'
  | 'queue'
  | 'storage'
  | 'external'
  | 'internal';
