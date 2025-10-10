/**
 * Regex pattern validation to prevent ReDoS attacks
 * Uses safe-regex2 package for robust ReDoS detection
 */

import safeRegex from 'safe-regex2';

export class UnsafeRegexError extends Error {
  constructor(pattern: string, reason: string) {
    super(`Unsafe regex pattern detected: ${reason}. Pattern: ${pattern}`);
    this.name = 'UnsafeRegexError';
  }
}

/**
 * Validates regex patterns for potential ReDoS vulnerabilities
 * Uses safe-regex2 for robust detection
 */
export class RegexValidator {
  /**
   * Validates a regex pattern for ReDoS vulnerabilities
   * @param pattern - The regex pattern to validate
   * @throws UnsafeRegexError if pattern is unsafe
   */
  static validatePattern(pattern: string): void {
    if (!safeRegex(new RegExp(pattern))) {
      throw new UnsafeRegexError(
        pattern,
        'Pattern detected as unsafe by safe-regex2',
      );
    }
  }

  /**
   * Checks if a pattern is safe to execute
   * @param pattern - The regex pattern to check
   * @param _maxComplexity - Unused parameter (kept for API compatibility)
   * @returns true if pattern is safe, false otherwise
   */
  static isSafePattern(pattern: string): boolean {
    return safeRegex(new RegExp(pattern));
  }

}
