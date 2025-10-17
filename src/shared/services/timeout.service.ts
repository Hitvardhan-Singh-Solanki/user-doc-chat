import { logger } from '@config/logger.config';
import type { TimeoutMetrics, TimeoutHandler } from '@shared/types';

export class TimeoutService implements TimeoutHandler {
  private readonly log = logger.child({ component: 'TimeoutService' });
  private metrics: TimeoutMetrics = {
    totalTimeouts: 0,
    averageTimeoutDuration: 0,
    timeoutRate: 0,
    operationsTimedOut: [],
  };

  async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const startTime = Date.now();

    try {
      const result = await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(
              new Error(
                `${operationName} request timed out after ${timeoutMs}ms`,
              ),
            );
          });
        }),
      ]);

      clearTimeout(timeoutId);
      this.onSuccess(operationName, Date.now() - startTime);
      return result;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        this.onTimeout(operationName, timeoutMs);
        throw new Error(
          `${operationName} request timed out after ${timeoutMs}ms`,
        );
      }

      throw err;
    }
  }

  async *withStreamTimeout<T>(
    generatorFactory: () => AsyncGenerator<T>,
    timeoutMs: number,
    operationName: string,
  ): AsyncGenerator<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const generator = generatorFactory();

      for await (const item of generator) {
        if (controller.signal.aborted) {
          throw new Error(
            `${operationName} request timed out after ${timeoutMs}ms`,
          );
        }

        yield item;
      }

      clearTimeout(timeoutId);
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        this.onTimeout(operationName, timeoutMs);
        throw new Error(
          `${operationName} request timed out after ${timeoutMs}ms`,
        );
      }

      throw err;
    }
  }

  onTimeout(operationName: string, timeoutMs: number): void {
    this.metrics.totalTimeouts++;
    this.metrics.operationsTimedOut.push(operationName);
    this.metrics.timeoutRate =
      this.metrics.totalTimeouts / (this.metrics.totalTimeouts + 1);

    this.log.warn({ operationName, timeoutMs }, 'Operation timed out');
  }

  onSuccess(operationName: string, duration: number): void {
    this.metrics.averageTimeoutDuration =
      (this.metrics.averageTimeoutDuration + duration) / 2;

    this.log.debug(
      { operationName, duration },
      'Operation completed successfully',
    );
  }

  getMetrics(): TimeoutMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalTimeouts: 0,
      averageTimeoutDuration: 0,
      timeoutRate: 0,
      operationsTimedOut: [],
    };
  }
}
