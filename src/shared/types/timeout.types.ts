export interface TimeoutConfig {
  requestTimeout: number;
  streamTimeout: number;
  connectionTimeout: number;
}

export interface TimeoutResult<T> {
  result: T;
  timedOut: boolean;
  duration: number;
}

export interface TimeoutError extends Error {
  operationName: string;
  timeoutMs: number;
  timedOut: boolean;
}

export interface TimeoutService {
  withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T>;

  withStreamTimeout<T>(
    generatorFactory: () => AsyncGenerator<T>,
    timeoutMs: number,
    operationName: string,
  ): AsyncGenerator<T>;
}

export interface TimeoutMetrics {
  totalTimeouts: number;
  averageTimeoutDuration: number;
  timeoutRate: number;
  operationsTimedOut: string[];
}

export interface TimeoutHandler {
  onTimeout(operationName: string, timeoutMs: number): void;
  onSuccess(operationName: string, duration: number): void;
}
