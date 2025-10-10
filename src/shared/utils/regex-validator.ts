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
      throw new UnsafeRegexError(pattern, 'Pattern detected as unsafe by safe-regex2');
    }
  }

  /**
   * Checks if a pattern is safe to execute
   * @param pattern - The regex pattern to check
   * @param _maxComplexity - Unused parameter (kept for API compatibility)
   * @returns true if pattern is safe, false otherwise
   */
  static isSafePattern(pattern: string, _maxComplexity: number = 1000): boolean {
    try {
      return safeRegex(new RegExp(pattern));
    } catch {
      return false;
    }
  }

  /**
   * Estimates the complexity of a regex pattern
   * @param pattern - The regex pattern to analyze
   * @returns A complexity score (simplified implementation)
   */
  static estimateComplexity(pattern: string): number {
    // Simple complexity estimation based on pattern length and features
    let complexity = pattern.length;
    
    // Add complexity for quantifiers
    complexity += (pattern.match(/[+*?]/g) || []).length * 2;
    complexity += (pattern.match(/\{[^}]+\}/g) || []).length * 3;
    
    // Add complexity for alternation
    complexity += (pattern.match(/\|/g) || []).length * 5;
    
    // Add complexity for groups
    complexity += (pattern.match(/\(/g) || []).length * 2;
    
    return complexity;
  }
}
