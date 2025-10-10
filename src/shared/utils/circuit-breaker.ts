import CircuitBreaker from 'opossum';
import { logger } from '@config/logger.config';
import { CircuitBreakerOptions } from '@shared/types/circuit-breaker.types';

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
      } catch {
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
 * Service for managing circuit breakers
 */
export class CircuitBreakerService {
  private static instance: CircuitBreakerService;
  private breakers: Map<string, CircuitBreaker> = new Map();
  private breakerFunctions: Map<
    string,
    (...args: unknown[]) => Promise<unknown>
  > = new Map();

  static getInstance(): CircuitBreakerService {
    if (!CircuitBreakerService.instance) {
      CircuitBreakerService.instance = new CircuitBreakerService();
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
    if (!existingFunction) {
      const breaker = createCircuitBreaker(fn, { ...options, name });
      this.breakers.set(name, breaker);
      this.breakerFunctions.set(name, fn);
    }
    return this.breakers.get(name) as CircuitBreaker<
      Parameters<T>,
      ReturnType<T>
    >;
  }

  /**
   * Get breaker status for monitoring
   */
  getBreakerStatus(name: string) {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    return {
      name: breaker.name,
      stats: breaker.stats,
    };
  }

  /**
   * Get all breaker statuses
   */
  getAllBreakerStatuses() {
    const statuses: Record<string, unknown> = {};
    for (const [name, breaker] of this.breakers) {
      statuses[name] = {
        name: breaker.name,
        stats: breaker.stats,
      };
    }
    return statuses;
  }

  /**
   * Reset a specific breaker
   */
  resetBreaker(name: string) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.close();
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
    this.breakers.clear();
    this.breakerFunctions.clear();
    logger.info('All circuit breakers cleared');
  }
}

export const circuitBreakerService = CircuitBreakerService.getInstance();
