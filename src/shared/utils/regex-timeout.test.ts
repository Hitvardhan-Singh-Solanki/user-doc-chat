/**
 * Tests for regex timeout protection and ReDoS prevention
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRegexTimeout,
  withRegexTimeoutFallback,
  safeRegexTest,
  safeRegexMatch,
  safeRegexReplace,
  safeRegexExec,
  isSafeRegexPattern,
  validateRegexPattern,
  RegexTimeoutError,
} from './regex-timeout';
import { UnsafeRegexError } from './regex-validator';

describe('RegexTimeout Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pattern Validation', () => {
    it('should validate safe patterns', () => {
      const safePatterns = [
        'hello',
        'world',
        '\\d+',
        '[a-z]+',
        '^start',
        'end$',
        '(group)',
      ];

      safePatterns.forEach((pattern) => {
        expect(() => validateRegexPattern(pattern)).not.toThrow();
        expect(isSafeRegexPattern(pattern)).toBe(true);
      });
    });

    it('should reject unsafe patterns', () => {
      // Only patterns that safe-regex2 actually considers unsafe
      const unsafePatterns = [
        '(a+)+', // Nested quantifiers
        '(a*)*', // Nested quantifiers
        '(a?)?', // Nested quantifiers
      ];

      unsafePatterns.forEach((pattern) => {
        expect(() => validateRegexPattern(pattern)).toThrow(UnsafeRegexError);
        expect(isSafeRegexPattern(pattern)).toBe(false);
      });
    });

    it('should validate pattern safety correctly', () => {
      expect(isSafeRegexPattern('simple')).toBe(true);
      expect(isSafeRegexPattern('hello')).toBe(true);
    });
  });

  describe('Safe Regex Operations', () => {
    it('should execute safe regex test', async () => {
      const regex = /hello/;
      const text = 'hello world';

      const result = await safeRegexTest(regex, text);
      expect(result).toBe(true);
    });

    it('should execute safe regex match', async () => {
      const regex = /hello/;
      const text = 'hello world';

      const result = await safeRegexMatch(regex, text);
      expect(result).toEqual(expect.arrayContaining(['hello']));
    });

    it('should execute safe regex replace', async () => {
      const regex = /hello/;
      const text = 'hello world';

      const result = await safeRegexReplace(regex, text, 'hi');
      expect(result).toBe('hi world');
    });

    it('should execute safe regex exec', async () => {
      const regex = /hello/g;
      const text = 'hello world hello';

      const result = await safeRegexExec(regex, text);
      expect(result).toHaveLength(2);
      expect(result[0][0]).toBe('hello');
      expect(result[1][0]).toBe('hello');
    });
  });

  describe('Timeout Protection', () => {
    it('should timeout on long-running regex operations', async () => {
      // This pattern can cause catastrophic backtracking
      const dangerousPattern = '(a+)+$';
      const text = 'a'.repeat(1000) + 'b';

      // Use a very short timeout to test timeout behavior
      const result = await safeRegexTest(
        new RegExp(dangerousPattern),
        text,
        10,
      );
      expect(result).toBe(false);
    }, 10000);

    it('should handle timeout errors gracefully', async () => {
      const regex = /(a+)+$/;
      const text = 'a'.repeat(100) + 'b';

      const result = await safeRegexTest(regex, text, 1);
      expect(result).toBe(false);
    });

    it('should reject unsafe patterns before execution', async () => {
      const unsafePattern = '(a+)+';
      const text = 'hello';

      await expect(
        withRegexTimeout(new RegExp(unsafePattern), text, (r, t) => r.test(t)),
      ).rejects.toThrow(UnsafeRegexError);
    });
  });

  describe('Fallback Mechanism', () => {
    it('should use fallback when Workers are not available', async () => {
      const regex = /hello/;
      const text = 'hello world';

      const result = await withRegexTimeoutFallback(regex, text, (r, t) =>
        r.test(t),
      );
      expect(result).toBe(true);
    });

    it('should validate patterns in fallback mode', async () => {
      const unsafePattern = '(a+)+';
      const text = 'hello';

      await expect(
        withRegexTimeoutFallback(new RegExp(unsafePattern), text, (r, t) =>
          r.test(t),
        ),
      ).rejects.toThrow(UnsafeRegexError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', async () => {
      const regex = /hello/;
      const text = '';

      const result = await safeRegexTest(regex, text);
      expect(result).toBe(false);
    });

    it('should handle very long text', async () => {
      const regex = /hello/;
      const text = 'a'.repeat(10000);

      const result = await safeRegexTest(regex, text);
      expect(result).toBe(false);
    });

    it('should handle regex with flags', async () => {
      const regex = /hello/i;
      const text = 'HELLO WORLD';

      const result = await safeRegexTest(regex, text);
      expect(result).toBe(true);
    });

    it('should handle global regex', async () => {
      const regex = /hello/g;
      const text = 'hello world hello';

      const result = await safeRegexExec(regex, text);
      expect(result).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw RegexTimeoutError on timeout', async () => {
      // Use a pattern that will take a long time but is safe
      const regex = /a{1,1000}$/;
      const text = 'a'.repeat(2000) + 'b';

      // Mock setTimeout to make the timeout trigger immediately
      const originalSetTimeout = global.setTimeout;
      // @ts-expect-error - Mock function doesn't need all setTimeout properties
      global.setTimeout = vi.fn(
        (callback: (...args: unknown[]) => void, delay: number) => {
          if (delay === 1) {
            // For our test timeout, trigger immediately
            callback();
          } else {
            // For other timeouts, use original behavior
            return originalSetTimeout(callback, delay);
          }
          return {} as NodeJS.Timeout;
        },
      );

      try {
        await expect(
          withRegexTimeout(regex, text, (r, t) => r.test(t), 1),
        ).rejects.toThrow(RegexTimeoutError);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should throw UnsafeRegexError for dangerous patterns', async () => {
      const regex = /(a+)+/;
      const text = 'hello';

      await expect(
        withRegexTimeout(regex, text, (r, t) => r.test(t)),
      ).rejects.toThrow(UnsafeRegexError);
    });

    it('should handle worker errors gracefully', async () => {
      // Mock Worker to throw an error
      const originalWorker = global.Worker;
      global.Worker = vi.fn().mockImplementation(() => {
        throw new Error('Worker not available');
      });

      const regex = /hello/;
      const text = 'hello world';

      // Should fallback to validation-based approach
      const result = await withRegexTimeout(regex, text, (r, t) => r.test(t));
      expect(result).toBe(true);

      // Restore original Worker
      global.Worker = originalWorker;
    });
  });

  describe('Performance Tests', () => {
    it('should complete simple operations quickly', async () => {
      const start = Date.now();
      const regex = /hello/;
      const text = 'hello world';

      await safeRegexTest(regex, text);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should limit execution time for complex patterns', async () => {
      const start = Date.now();
      const regex = /(a+)+$/;
      const text = 'a'.repeat(50) + 'b';

      const result = await safeRegexTest(regex, text, 100);
      const duration = Date.now() - start;

      expect(result).toBe(false);
      expect(duration).toBeLessThan(200); // Should timeout within 200ms
    }, 5000);
  });
});
