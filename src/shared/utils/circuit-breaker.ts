import CircuitBreaker from 'opossum';
import { logger } from '@config/logger.config';
import {
  CircuitBreakerOptions,
  CircuitBreakerServiceConfig,
  BreakerMetadata,
} from '@shared/types/circuit-breaker.types';

/**
 * Creates a circuit breaker for a given function
 * @param fn - The function to wrap with circuit breaker
 * @param options - Circuit breaker configuration options
 * @returns Circuit breaker instance
 */
export function createCircuitBreaker<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (...args: any[]) => Promise<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
>(fn: T, options: CircuitBreakerOptions = {}): CircuitBreaker<any, any> {
  const {
    timeout = 30000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    name = fn.name || 'unknown',
  } = options;

  const breaker = new CircuitBreaker(fn, {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    name,
  });

  breaker.on('open', () => {
    logger.warn(
      { name, timeout, errorThresholdPercentage },
      'Circuit breaker opened',
    );
  });

  breaker.on('halfOpen', () => {
    logger.info({ name }, 'Circuit breaker half-open');
  });

  breaker.on('close', () => {
    logger.info({ name }, 'Circuit breaker closed');
  });

  breaker.on('failure', (err) => {
    let errorDescription: string;

    if (err instanceof Error) {
      errorDescription = err.message;
    } else if (typeof err === 'string') {
      errorDescription = err;
    } else if (err && typeof err === 'object') {
      try {
        errorDescription = JSON.stringify(err);
      } catch (stringifyError) {
        logger.debug({ stringifyError }, 'Failed to stringify error object');
        errorDescription = 'Unknown error';
      }
    } else {
      errorDescription = String(err) || 'Unknown error';
    }

    logger.warn(
      { name, error: errorDescription, originalError: err },
      'Circuit breaker failure',
    );
  });

  breaker.on('success', () => {
    logger.debug({ name }, 'Circuit breaker success');
  });

  return breaker;
}

/**
 * Service for managing circuit breakers with memory leak prevention
 *
 * TODO: Consider creating a lightweight npm library for generic memory management
 * of any Map-based services (circuit breakers, caches, connection pools, etc.)
 * This would be useful for the broader Node.js ecosystem.
 */
export class CircuitBreakerService {
  private static instance: CircuitBreakerService;
  private breakers: Map<string, CircuitBreaker> = new Map();
  private breakerFunctions: Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  > = new Map();
  private breakerMetadata: Map<string, BreakerMetadata> = new Map();
  private config: Required<CircuitBreakerServiceConfig>;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor(config: CircuitBreakerServiceConfig = {}) {
    this.config = {
      maxBreakers: config.maxBreakers ?? 1000,
      ttlMs: config.ttlMs ?? 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
      alertThreshold: config.alertThreshold ?? 800, // 80% of maxBreakers
    };
    this.startCleanupTimer();
  }

  static getInstance(
    config?: CircuitBreakerServiceConfig,
  ): CircuitBreakerService {
    if (!CircuitBreakerService.instance) {
      CircuitBreakerService.instance = new CircuitBreakerService(config);
    } else if (config) {
      // Update config if provided
      CircuitBreakerService.instance.updateConfig(config);
    }
    return CircuitBreakerService.instance;
  }

  getBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
    name: string,
    fn: T,
    options: CircuitBreakerOptions = {},
  ): CircuitBreaker<Parameters<T>, ReturnType<T>> {
    const existingFunction = this.breakerFunctions.get(name);
    if (existingFunction && existingFunction !== fn) {
      throw new Error(
        `Circuit breaker "${name}" already exists with a different function`,
      );
    }

    // Always perform TTL cleanup first
    this.performTTLCleanup();

    if (existingFunction) {
      // Breaker already exists, just update access metadata
      this.updateAccessMetadata(name);
    } else {
      // Breaker doesn't exist, create new one
      // Evict if we're at or will exceed the limit
      if (this.breakers.size >= this.config.maxBreakers) {
        this.evictLeastRecentlyUsed();
      }
      const breaker = createCircuitBreaker(fn, { ...options, name });
      this.breakers.set(name, breaker);
      this.breakerFunctions.set(name, fn);
      this.breakerMetadata.set(name, {
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
      });
    }

    return this.breakers.get(name) as CircuitBreaker<
      Parameters<T>,
      ReturnType<T>
    >;
  }

  /**
   * Remove a specific breaker
   */
  removeBreaker(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.shutdown();
      this.breakers.delete(name);
      this.breakerFunctions.delete(name);
      this.breakerMetadata.delete(name);
      logger.info({ name }, 'Circuit breaker removed');
      return true;
    }
    return false;
  }

  /**
   * Get breaker status for monitoring
   */
  getBreakerStatus(name: string, updateAccess = true) {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    if (updateAccess) {
      this.updateAccessMetadata(name);
    }
    return {
      name: breaker.name,
      stats: breaker.stats,
      metadata: this.breakerMetadata.get(name),
    };
  }

  /**
   * Get all breaker statuses
   */
  getAllBreakerStatuses() {
    const statuses: Record<string, unknown> = {};
    for (const [name, breaker] of this.breakers) {
      this.updateAccessMetadata(name);
      statuses[name] = {
        name: breaker.name,
        stats: breaker.stats,
        metadata: this.breakerMetadata.get(name),
      };
    }
    return statuses;
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    const now = Date.now();
    const totalBreakers = this.breakers.size;
    const metadataValues = Array.from(this.breakerMetadata.values());

    let oldestBreaker = 0;
    let newestBreaker = 0;

    if (metadataValues.length > 0) {
      oldestBreaker = Math.min(...metadataValues.map((m) => m.createdAt));
      newestBreaker = Math.max(...metadataValues.map((m) => m.createdAt));
    }

    return {
      totalBreakers,
      maxBreakers: this.config.maxBreakers,
      utilizationPercentage: (totalBreakers / this.config.maxBreakers) * 100,
      oldestBreakerAge: oldestBreaker ? now - oldestBreaker : 0,
      newestBreakerAge: newestBreaker ? now - newestBreaker : 0,
      isNearCapacity: totalBreakers >= this.config.alertThreshold,
    };
  }

  /**
   * Reset a specific breaker
   */
  resetBreaker(name: string) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.close();
      this.updateAccessMetadata(name);
      logger.info({ name }, 'Circuit breaker manually reset');
    }
  }

  /**
   * Reset all breakers
   */
  resetAllBreakers() {
    for (const [, breaker] of this.breakers) {
      breaker.close();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Clear all breakers and their function references
   */
  clearAllBreakers() {
    for (const [, breaker] of this.breakers) {
      breaker.shutdown();
    }
    this.breakers.clear();
    this.breakerFunctions.clear();
    this.breakerMetadata.clear();
    logger.info('All circuit breakers cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CircuitBreakerServiceConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.startCleanupTimer();
    logger.info(
      { config: this.config },
      'Circuit breaker service config updated',
    );
  }

  /**
   * Cleanup and destroy the service
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clearAllBreakers();
  }

  private updateAccessMetadata(name: string) {
    const metadata = this.breakerMetadata.get(name);
    if (metadata) {
      metadata.lastAccessedAt = Date.now();
      metadata.accessCount++;
    }
  }

  private evictLeastRecentlyUsed() {
    let oldestName = '';
    let oldestTime = Date.now();
    let firstBreaker = '';

    for (const [name, metadata] of this.breakerMetadata) {
      if (firstBreaker === '') {
        firstBreaker = name;
      }
      if (metadata.lastAccessedAt < oldestTime) {
        oldestTime = metadata.lastAccessedAt;
        oldestName = name;
      }
    }

    // If no breaker was found (all have same timestamp), use the first one
    if (oldestName === '') {
      oldestName = firstBreaker;
    }

    if (oldestName) {
      this.removeBreaker(oldestName);
      logger.warn(
        { evictedBreaker: oldestName, totalBreakers: this.breakers.size },
        'Evicted least recently used circuit breaker due to capacity limit',
      );
    }
  }

  private startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.performTTLCleanup();
    }, this.config.cleanupIntervalMs);
  }

  private performTTLCleanup() {
    const now = Date.now();
    const expiredBreakers: string[] = [];

    for (const [name, metadata] of this.breakerMetadata) {
      if (now - metadata.lastAccessedAt > this.config.ttlMs) {
        expiredBreakers.push(name);
      }
    }

    for (const name of expiredBreakers) {
      this.removeBreaker(name);
    }

    if (expiredBreakers.length > 0) {
      logger.info(
        { expiredCount: expiredBreakers.length, expiredBreakers },
        'Cleaned up expired circuit breakers',
      );
    }

    this.checkAlertThreshold();
  }

  private checkAlertThreshold() {
    const stats = this.getServiceStats();
    if (stats.isNearCapacity) {
      logger.warn(
        {
          totalBreakers: stats.totalBreakers,
          maxBreakers: stats.maxBreakers,
          utilizationPercentage: stats.utilizationPercentage.toFixed(2),
        },
        'Circuit breaker service near capacity limit',
      );
    }
  }
}

export const circuitBreakerService = CircuitBreakerService.getInstance();
