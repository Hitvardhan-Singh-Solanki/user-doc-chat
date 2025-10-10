/**
 * Regex pattern validation to prevent ReDoS attacks
 * Validates patterns before execution to catch potentially dangerous regex
 */

export class UnsafeRegexError extends Error {
  constructor(pattern: string, reason: string) {
    super(`Unsafe regex pattern detected: ${reason}. Pattern: ${pattern}`);
    this.name = 'UnsafeRegexError';
  }
}

/**
 * Validates regex patterns for potential ReDoS vulnerabilities
 */
export class RegexValidator {
  private static readonly DANGEROUS_PATTERNS = [
    // Catastrophic backtracking patterns
    /\(\?\=.*\*\)/, // Positive lookahead with quantifier
    /\(\?\=.*\+\)/, // Positive lookahead with quantifier
    /\(\?\=.*\?\)/, // Positive lookahead with quantifier
    /\(\?\=.*\{[^}]*\}\)/, // Positive lookahead with quantifier
    /\(\?\=.*\*.*\*\)/, // Nested quantifiers in lookahead
    /\(\?\=.*\+.*\+\)/, // Nested quantifiers in lookahead
    /\(\?\=.*\?.*\?\)/, // Nested quantifiers in lookahead
    /\(\?\=.*\{[^}]*\}.*\{[^}]*\}\)/, // Nested quantifiers in lookahead
  ];

  private static readonly DANGEROUS_QUANTIFIERS = [
    /\(\?\=.*\*\)/, // Lookahead with *
    /\(\?\=.*\+\)/, // Lookahead with +
    /\(\?\=.*\?\)/, // Lookahead with ?
    /\(\?\=.*\{[^}]*\}\)/, // Lookahead with {}
  ];

  /**
   * Validates a regex pattern for ReDoS vulnerabilities
   */
  static validatePattern(pattern: string): void {
    // Check for nested quantifiers
    if (this.hasNestedQuantifiers(pattern)) {
      throw new UnsafeRegexError(pattern, 'Nested quantifiers detected');
    }

    // Check for dangerous lookahead/lookbehind patterns
    if (this.hasDangerousLookahead(pattern)) {
      throw new UnsafeRegexError(
        pattern,
        'Dangerous lookahead pattern detected',
      );
    }

    // Check for exponential backtracking patterns
    if (this.hasExponentialBacktracking(pattern)) {
      throw new UnsafeRegexError(
        pattern,
        'Exponential backtracking pattern detected',
      );
    }

    // Check for excessive repetition
    if (this.hasExcessiveRepetition(pattern)) {
      throw new UnsafeRegexError(
        pattern,
        'Excessive repetition pattern detected',
      );
    }
  }

  /**
   * Checks for nested quantifiers that can cause catastrophic backtracking
   */
  private static hasNestedQuantifiers(pattern: string): boolean {
    // Look for patterns like (a+)+ or (a*)*
    // Match closing paren followed by quantifier
    if (/\)[+*?]/.test(pattern)) {
      return true;
    }
    // Match closing paren followed by {n,m}
    if (/\)\{/.test(pattern)) {
      return true;
    }
    return false;
  }

  /**
   * Checks for dangerous lookahead/lookbehind patterns
   */
  private static hasDangerousLookahead(pattern: string): boolean {
    // Check for lookahead with quantifiers
    const lookaheadWithQuantifier = /\(\?\=[^)]*[+*?\{][^)]*\)/;
    return lookaheadWithQuantifier.test(pattern);
  }

  /**
   * Checks for exponential backtracking patterns
   */
  private static hasExponentialBacktracking(pattern: string): boolean {
    // Check for patterns like (a|a)* or (a|a)+
    // Match (x|x) patterns followed by quantifiers
    const exponentialPattern = /\([^)]*\|[^)]*\)[+*?]?/;
    if (exponentialPattern.test(pattern)) {
      // Check if there are duplicate alternatives
      const alternationMatch = pattern.match(/\(([^)]*)\)/g);
      if (alternationMatch) {
        for (const group of alternationMatch) {
          const alternatives = group.slice(1, -1).split('|');
          const uniqueAlts = new Set(alternatives);
          if (uniqueAlts.size < alternatives.length) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Checks for excessive repetition patterns
   */
  private static hasExcessiveRepetition(pattern: string): boolean {
    // Check for patterns with very high repetition counts
    const highRepetition = /\{[0-9]{3,}/; // 3+ digits in {}
    if (highRepetition.test(pattern)) {
      return true;
    }
    // Also check for malformed patterns like {1,2,3}
    const malformedRepetition = /\{[^}]*,[^}]*,[^}]*\}/;
    if (malformedRepetition.test(pattern)) {
      return true;
    }
    return false;
  }

  /**
   * Estimates the complexity of a regex pattern
   */
  static estimateComplexity(pattern: string): number {
    let complexity = 0;

    // Base complexity
    complexity += pattern.length;

    // Add complexity for lookahead/lookbehind first (to exclude from quantifier counting)
    const lookaheadCount = (pattern.match(/\(\?[=!]/g) || []).length;
    complexity += lookaheadCount * 10;

    // Add complexity for quantifiers (excluding the ? in lookahead)
    // Remove lookahead syntax before counting quantifiers
    const patternWithoutLookahead = pattern.replace(/\(\?[=!]/g, '');
    complexity += (patternWithoutLookahead.match(/\+/g) || []).length * 5;
    complexity += (patternWithoutLookahead.match(/[*?]/g) || []).length * 4;
    complexity += (pattern.match(/\{[^}]+\}/g) || []).length * 2;

    // Add complexity for alternation
    complexity += (pattern.match(/\|/g) || []).length * 5;

    // Add complexity for capturing groups (excluding lookahead)
    const totalGroups = (pattern.match(/\(/g) || []).length;
    const capturingGroups = totalGroups - lookaheadCount;
    complexity += capturingGroups * 2;

    // Add complexity for nested groups
    const nestedGroups = pattern.match(/\([^)]*\(/g) || [];
    complexity += nestedGroups.length * 15;

    return complexity;
  }

  /**
   * Checks if a pattern is safe to execute
   */
  static isSafePattern(pattern: string, maxComplexity: number = 1000): boolean {
    try {
      this.validatePattern(pattern);
      return this.estimateComplexity(pattern) <= maxComplexity;
    } catch {
      return false;
    }
  }
}
