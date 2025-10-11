/**
 * Utility for safe regex operations with timeout protection
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 */

import { Worker } from 'worker_threads';
import { join } from 'path';
import { logger } from '@config/logger.config';
import { REGEX_TIMEOUT_MS } from '@config/prompt.config';
import { RegexValidator, UnsafeRegexError } from './regex-validator';

export class RegexTimeoutError extends Error {
  constructor(pattern: string, timeout: number) {
    super(
      `Regex operation timed out after ${timeout}ms for pattern: ${pattern}`,
    );
    this.name = 'RegexTimeoutError';
  }
}

interface RegexWorkerData {
  operation: 'test' | 'match' | 'replace' | 'exec';
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
  maxIterations?: number;
}

interface RegexWorkerResult {
  success: boolean;
  result?: string | RegExpExecArray | RegExpExecArray[] | null;
  error?: string;
}

/**
 * Executes a regex operation in a Worker thread with hard timeout protection
 * @param regex - The compiled regex pattern
 * @param text - The text to search
 * @param operation - The regex operation to perform
 * @param timeout - Timeout in milliseconds (default: REGEX_TIMEOUT_MS)
 * @returns The result of the regex operation
 * @throws RegexTimeoutError if operation exceeds timeout
 * @throws UnsafeRegexError if pattern is potentially dangerous
 */
export async function withRegexTimeout<T>(
  regex: RegExp,
  text: string,
  operation: (regex: RegExp, text: string) => T,
  timeout: number = REGEX_TIMEOUT_MS,
  replacement?: string,
  maxIterations?: number,
): Promise<T> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return withRegexTimeoutFallback(regex, text, operation, timeout);
  }

  try {
    const operationData = determineOperationType(
      operation,
      replacement,
      maxIterations,
    );
    return await executeWorkerOperation(regex, text, operationData, timeout);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Workers not available, falling back to validation-based protection',
    );
    return withRegexTimeoutFallback(regex, text, operation, timeout);
  }
}

function determineOperationType(
  operation: (regex: RegExp, text: string) => unknown,
  replacement?: string,
  maxIterations?: number,
): RegexWorkerData {
  const iterations = maxIterations || 1000;
  const operationType = getOperationType(operation);
  const extractedReplacement = getReplacementValue(operation, replacement);

  return {
    operation: operationType,
    pattern: '',
    flags: '',
    text: '',
    replacement: extractedReplacement,
    maxIterations: iterations,
  };
}

function getOperationType(
  operation: (regex: RegExp, text: string) => unknown,
): 'test' | 'match' | 'replace' | 'exec' {
  if (operation.name === 'test' || operation.toString().includes('test')) {
    return 'test';
  }
  if (operation.name === 'match' || operation.toString().includes('match')) {
    return 'match';
  }
  if (operation.name === 'replace' || operation.toString().includes('replace')) {
    return 'replace';
  }
  return 'exec';
}

function getReplacementValue(
  operation: (regex: RegExp, text: string) => unknown,
  replacement?: string,
): string | undefined {
  if (replacement) {
    return replacement;
  }
  if (operation.name === 'replace' || operation.toString().includes('replace')) {
    return extractReplacementFromOperation(operation);
  }
  return undefined;
}

function extractReplacementFromOperation(
  operation: (regex: RegExp, text: string) => unknown,
): string | undefined {
  const operationStr = operation.toString();
  const replacementMatch = operationStr.match(
    /replace\([^,]+,\s*['"`]([^'"`]*)['"`]/,
  );
  return replacementMatch ? replacementMatch[1] : undefined;
}

async function executeWorkerOperation<T>(
  regex: RegExp,
  text: string,
  operationData: RegexWorkerData,
  timeout: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const workerPath = join(__dirname, 'regex-worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        ...operationData,
        pattern: regex.source,
        flags: regex.flags,
        text,
      } as RegexWorkerData,
    });

    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new RegexTimeoutError(regex.source, timeout));
    }, timeout);

    worker.on('message', (result: RegexWorkerResult) => {
      clearTimeout(timeoutId);
      worker.terminate();

      if (result.success) {
        resolve(result.result as T);
      } else {
        reject(new Error(result.error || 'Unknown worker error'));
      }
    });

    worker.on('error', (error) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeoutId);
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Safe regex test with timeout
 */
export async function safeRegexTest(
  regex: RegExp,
  text: string,
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<boolean> {
  try {
    return await withRegexTimeout(regex, text, (r, t) => r.test(t), timeout);
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex test timed out, treating as false',
      );
      return false;
    }
    if (error instanceof UnsafeRegexError) {
      logger.warn(
        { pattern: regex.source, reason: error.message },
        'Unsafe regex pattern detected, treating as false',
      );
      return false;
    }
    throw error;
  }
}

/**
 * Safe regex match with timeout
 */
export async function safeRegexMatch(
  regex: RegExp,
  text: string,
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<RegExpMatchArray | null> {
  try {
    return await withRegexTimeout(regex, text, (r, t) => t.match(r), timeout);
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex match timed out, returning null',
      );
      return null;
    }
    if (error instanceof UnsafeRegexError) {
      logger.warn(
        { pattern: regex.source, reason: error.message },
        'Unsafe regex pattern detected, returning null',
      );
      return null;
    }
    throw error;
  }
}

/**
 * Safe regex replace with timeout
 */
export async function safeRegexReplace(
  regex: RegExp,
  text: string,
  replacement: string | ((match: string, ...args: string[]) => string),
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<string> {
  try {
    return await withRegexTimeout(
      regex,
      text,
      (r, t) => t.replace(r, replacement as string),
      timeout,
      typeof replacement === 'string' ? replacement : undefined,
    );
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex replace timed out, returning original text',
      );
      return text;
    }
    if (error instanceof UnsafeRegexError) {
      logger.warn(
        { pattern: regex.source, reason: error.message },
        'Unsafe regex pattern detected, returning original text',
      );
      return text;
    }
    throw error;
  }
}

/**
 * Safe regex exec with bounded iterations
 */
export async function safeRegexExec(
  regex: RegExp,
  text: string,
  maxIterations: number = 1000,
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<RegExpExecArray[]> {
  try {
    return await withRegexTimeout(
      regex,
      text,
      (r, t) => {
        const results: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        let iterations = 0;

        while ((match = r.exec(t)) !== null && iterations < maxIterations) {
          results.push(match);
          iterations++;

          // Prevent infinite loop on zero-width matches
          if (match.index === r.lastIndex) {
            r.lastIndex++;
          }
        }

        if (iterations >= maxIterations) {
          logger.warn(
            { pattern: regex.source, iterations },
            'Regex exec reached max iterations, stopping',
          );
        }

        return results;
      },
      timeout,
      undefined,
      maxIterations,
    );
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex exec timed out, returning empty array',
      );
      return [];
    }
    if (error instanceof UnsafeRegexError) {
      logger.warn(
        { pattern: regex.source, reason: error.message },
        'Unsafe regex pattern detected, returning empty array',
      );
      return [];
    }
    throw error;
  }
}

/**
 * Fallback regex execution with timeout protection (for environments without Workers)
 * Uses safe-regex2 for validation and setTimeout-based protection
 */
export async function withRegexTimeoutFallback<T>(
  regex: RegExp,
  text: string,
  operation: (regex: RegExp, text: string) => T,
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<T> {
  // Validate pattern for ReDoS vulnerabilities using safe-regex2
  try {
    RegexValidator.validatePattern(regex.source);
  } catch (error) {
    if (error instanceof UnsafeRegexError) {
      logger.warn(
        { pattern: regex.source, reason: error.message },
        'Unsafe regex pattern detected, rejecting operation',
      );
      throw error;
    }
    throw error;
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new RegexTimeoutError(regex.source, timeout));
    }, timeout);

    try {
      const result = operation(regex, text);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Checks if a regex pattern is safe to execute
 */
export function isSafeRegexPattern(pattern: string): boolean {
  return RegexValidator.isSafePattern(pattern);
}

/**
 * Validates a regex pattern for ReDoS vulnerabilities
 */
export function validateRegexPattern(pattern: string): void {
  RegexValidator.validatePattern(pattern);
}
