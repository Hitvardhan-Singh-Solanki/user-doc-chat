/**
 * Custom error types for PromptService
 */

export class ResourceExhaustedError extends Error {
  constructor(resource: string, limit: number, actual: number) {
    super(
      `Resource limit exceeded: ${resource} (limit: ${limit}, actual: ${actual})`,
    );
    this.name = 'ResourceExhaustedError';
  }
}

export class TimeoutError extends Error {
  constructor(operation: string, timeout: number) {
    super(`Operation timed out: ${operation} (timeout: ${timeout}ms)`);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends Error {
  constructor(field: string, value: unknown, reason: string) {
    super(`Validation failed for ${field}: ${reason} (value: ${typeof value})`);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends Error {
  constructor(reason: string, input?: string) {
    const message = input
      ? `Security violation: ${reason} (input: ${input.length > 100 ? input.substring(0, 100) + '...' : input})`
      : `Security violation: ${reason}`;
    super(message);
    this.name = 'SecurityError';
  }
}

export class PromptInjectionError extends SecurityError {
  constructor(pattern: string, input: string) {
    super(`Potential prompt injection detected: ${pattern}`, input);
    this.name = 'PromptInjectionError';
  }
}
