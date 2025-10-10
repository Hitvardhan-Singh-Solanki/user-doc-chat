/**
 * Tests for regex pattern validation and ReDoS prevention
 */

import { describe, it, expect } from 'vitest';
import { RegexValidator, UnsafeRegexError } from './regex-validator';

describe('RegexValidator', () => {
  describe('validatePattern', () => {
    it('should validate safe patterns', () => {
      const safePatterns = [
        'hello',
        'world',
        '\\d+',
        '[a-z]+',
        '^start',
        'end$',
        '(group)',
        'a{1,5}',
        'a?',
        'a*',
        'a+',
        '(a|b)',
        '\\w+',
        '\\s+',
        '\\bword\\b',
      ];

      safePatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).not.toThrow();
      });
    });

    it('should reject nested quantifiers', () => {
      const nestedQuantifierPatterns = [
        '(a+)+',
        '(a*)*',
        '(a?)?',
        '(a{1,5})+',
        '((a+)+)+',
        '(a+)*',
        '(a*)+',
      ];

      nestedQuantifierPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).toThrow(
          UnsafeRegexError,
        );
      });
    });

    it('should reject dangerous lookahead patterns', () => {
      const dangerousLookaheadPatterns = [
        '(?=a*)',
        '(?=a+)',
        '(?=a?)',
        '(?=a{1,5})',
        '(?=.*)',
        '(?=a*.*)',
        '(?=a+.*)',
      ];

      dangerousLookaheadPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).toThrow(
          UnsafeRegexError,
        );
      });
    });

    it('should reject exponential backtracking patterns', () => {
      const exponentialPatterns = [
        '(a|a)*',
        '(a|a)+',
        '(a|a)?',
        '(a|a){1,5}',
        '(a|a|a)*',
        '(a|b|a)*',
        '(a|a|b)*',
      ];

      exponentialPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).toThrow(
          UnsafeRegexError,
        );
      });
    });

    it('should reject excessive repetition patterns', () => {
      const excessiveRepetitionPatterns = [
        'a{1000}',
        'a{999}',
        'a{500,1000}',
        'a{100,200,300}',
        'a{1000,}',
      ];

      excessiveRepetitionPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).toThrow(
          UnsafeRegexError,
        );
      });
    });
  });

  describe('estimateComplexity', () => {
    it('should estimate complexity correctly', () => {
      expect(RegexValidator.estimateComplexity('hello')).toBe(5);
      expect(RegexValidator.estimateComplexity('a+')).toBe(7); // 2 + 2*1
      expect(RegexValidator.estimateComplexity('a*')).toBe(6); // 2 + 2*1
      expect(RegexValidator.estimateComplexity('a?')).toBe(6); // 2 + 2*1
      expect(RegexValidator.estimateComplexity('a{1,5}')).toBe(8); // 5 + 3*1
      expect(RegexValidator.estimateComplexity('(a|b)')).toBe(12); // 5 + 5*1
      expect(RegexValidator.estimateComplexity('(?=a)')).toBe(15); // 4 + 10*1
    });

    it('should handle complex patterns', () => {
      const complexPattern =
        '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
      const complexity = RegexValidator.estimateComplexity(complexPattern);
      expect(complexity).toBeGreaterThan(50);
    });
  });

  describe('isSafePattern', () => {
    it('should identify safe patterns', () => {
      const safePatterns = [
        'hello',
        'world',
        '\\d+',
        '[a-z]+',
        '^start',
        'end$',
        '(group)',
        'a{1,5}',
        'a?',
        'a*',
        'a+',
        '(a|b)',
      ];

      safePatterns.forEach((pattern) => {
        expect(RegexValidator.isSafePattern(pattern)).toBe(true);
      });
    });

    it('should identify unsafe patterns', () => {
      const unsafePatterns = [
        '(a+)+',
        '(a*)*',
        '(a?)?',
        '(a|a)*',
        '(a|a)+',
        'a{1000}',
        '(?=a*)',
        '(?=a+)',
      ];

      unsafePatterns.forEach((pattern) => {
        expect(RegexValidator.isSafePattern(pattern)).toBe(false);
      });
    });

    it('should respect max complexity limit', () => {
      const pattern = 'a'.repeat(100);
      expect(RegexValidator.isSafePattern(pattern, 50)).toBe(false);
      expect(RegexValidator.isSafePattern(pattern, 200)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty patterns', () => {
      expect(() => RegexValidator.validatePattern('')).not.toThrow();
      expect(RegexValidator.isSafePattern('')).toBe(true);
    });

    it('should handle patterns with special characters', () => {
      const specialPatterns = [
        '\\d+',
        '\\w+',
        '\\s+',
        '\\b',
        '\\B',
        '\\n',
        '\\t',
        '\\r',
        '\\f',
        '\\v',
      ];

      specialPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).not.toThrow();
        expect(RegexValidator.isSafePattern(pattern)).toBe(true);
      });
    });

    it('should handle patterns with character classes', () => {
      const characterClassPatterns = [
        '[a-z]',
        '[A-Z]',
        '[0-9]',
        '[a-zA-Z]',
        '[^a-z]',
        '[\\d]',
        '[\\w]',
        '[\\s]',
      ];

      characterClassPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).not.toThrow();
        expect(RegexValidator.isSafePattern(pattern)).toBe(true);
      });
    });

    it('should handle patterns with anchors', () => {
      const anchorPatterns = ['^start', 'end$', '^start$', '\\A', '\\Z', '\\z'];

      anchorPatterns.forEach((pattern) => {
        expect(() => RegexValidator.validatePattern(pattern)).not.toThrow();
        expect(RegexValidator.isSafePattern(pattern)).toBe(true);
      });
    });
  });
});
