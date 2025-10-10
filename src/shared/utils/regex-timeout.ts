/**
 * Utility for safe regex operations with timeout protection
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 */

import { logger } from '@config/logger.config';
import { REGEX_TIMEOUT_MS } from '@chat/constants/prompt.constants';

export class RegexTimeoutError extends Error {
  constructor(pattern: string, timeout: number) {
    super(
      `Regex operation timed out after ${timeout}ms for pattern: ${pattern}`,
    );
    this.name = 'RegexTimeoutError';
  }
}

/**
 * Executes a regex operation with timeout protection
 * @param regex - The compiled regex pattern
 * @param text - The text to search
 * @param operation - The regex operation to perform
 * @param timeout - Timeout in milliseconds (default: REGEX_TIMEOUT_MS)
 * @returns The result of the regex operation
 * @throws RegexTimeoutError if operation exceeds timeout
 */
export async function withRegexTimeout<T>(
  regex: RegExp,
  text: string,
  operation: (regex: RegExp, text: string) => T,
  timeout: number = REGEX_TIMEOUT_MS,
): Promise<T> {
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
    );
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex replace timed out, returning original text',
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
    );
  } catch (error) {
    if (error instanceof RegexTimeoutError) {
      logger.warn(
        { pattern: regex.source, textLength: text.length },
        'Regex exec timed out, returning empty array',
      );
      return [];
    }
    throw error;
  }
}
