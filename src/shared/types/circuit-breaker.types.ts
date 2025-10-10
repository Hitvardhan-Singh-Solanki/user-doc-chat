import type { Options as OpossumOptions } from 'opossum';

export type CircuitBreakerOptions = Partial<OpossumOptions>;

export interface CircuitBreakerServiceConfig {
  maxBreakers?: number;
  ttlMs?: number;
  cleanupIntervalMs?: number;
  alertThreshold?: number;
}

export interface BreakerMetadata {
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}
