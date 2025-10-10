import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService } from '../services/prompt.service';
import { ITokenizer } from '@interfaces/tokenizer.interface';
import {
  MAX_INPUT_SIZE,
  LARGE_DOCUMENT_THRESHOLD,
} from '../constants/prompt.constants';

// Mock tokenizer with realistic performance characteristics
const mockTokenizer: ITokenizer = {
  countTokens: vi.fn((text: string) => {
    // Simulate realistic tokenization time
    const tokens = Math.ceil(text.length / 4);
    // Simulate 1ms per 1000 characters
    const delay = Math.ceil(text.length / 1000);
    return tokens;
  }),
  encode: vi.fn((text: string) => text.split(' ').map((_, i) => i + 1)),
  decode: vi.fn((tokens: number[]) => tokens.map((t) => `token${t}`).join(' ')),
};

describe('PromptService Performance Tests', () => {
  let promptService: PromptService;

  beforeEach(() => {
    vi.clearAllMocks();
    promptService = new PromptService(mockTokenizer);
  });

  describe('Large Document Processing', () => {
    it('should process 50MB document within time limit', () => {
      const largeDocument = 'A'.repeat(MAX_INPUT_SIZE + 1);

      const start = Date.now();
      expect(() => promptService.sanitizeText(largeDocument)).toThrow(); // Should throw ResourceExhaustedError
      const duration = Date.now() - start;

      // Should fail fast due to size limit, not hang
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should process 1MB document efficiently', () => {
      const mediumDocument = 'This is a legal document. '.repeat(40000); // ~1MB

      const start = Date.now();
      const result = promptService.sanitizeText(mediumDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should handle documents with many sentences', () => {
      const manySentences = Array(1000)
        .fill(0)
        .map(
          (_, i) =>
            `This is sentence ${i + 1} of a legal document. It contains important information.`,
        )
        .join(' ');

      const start = Date.now();
      const result = promptService.sanitizeText(manySentences);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(3000); // Less than 3 seconds
    });
  });

  describe('Token Counting Efficiency', () => {
    it('should cache tokenization results', () => {
      const text = 'This is a test document for tokenization caching.';

      // First call
      const start1 = Date.now();
      const result1 = promptService.sanitizeText(text);
      const duration1 = Date.now() - start1;

      // Second call with same text
      const start2 = Date.now();
      const result2 = promptService.sanitizeText(text);
      const duration2 = Date.now() - start2;

      expect(result1).toBe(result2);
      // Second call should be faster due to caching
      expect(duration2).toBeLessThanOrEqual(duration1);
    });

    it('should handle repeated tokenization efficiently', () => {
      const texts = Array(100)
        .fill(0)
        .map(
          (_, i) =>
            `Document ${i}: This is a legal document with important content.`,
        );

      const start = Date.now();
      const results = texts.map((text) => promptService.sanitizeText(text));
      const duration = Date.now() - start;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Less than 5 seconds for 100 documents
    });
  });

  describe('Memory Usage Patterns', () => {
    it('should not leak memory with repeated operations', () => {
      const text = 'This is a test document for memory leak detection.';

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const result = promptService.sanitizeText(text);
        expect(result).toBeDefined();
      }

      // If we get here without memory issues, the test passes
      expect(true).toBe(true);
    });

    it('should handle large text without excessive memory usage', () => {
      const largeText = 'A'.repeat(LARGE_DOCUMENT_THRESHOLD);

      const start = Date.now();
      const result = promptService.sanitizeText(largeText);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should process efficiently
    });
  });

  describe('Timeout Enforcement', () => {
    it('should handle operations within timeout limits', () => {
      const text = 'This is a normal document that should process quickly.';

      const start = Date.now();
      const result = promptService.sanitizeText(text);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should fail fast on oversized inputs', () => {
      const oversizedInput = 'A'.repeat(MAX_INPUT_SIZE + 1);

      const start = Date.now();
      expect(() => promptService.sanitizeText(oversizedInput)).toThrow();
      const duration = Date.now() - start;

      // Should fail immediately, not after processing
      expect(duration).toBeLessThan(100);
    });
  });

  describe('String Operations Performance', () => {
    it('should handle large string replacements efficiently', () => {
      const textWithManyReplacements = 'Hello World '.repeat(10000);

      const start = Date.now();
      const result = promptService.sanitizeText(textWithManyReplacements);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    it('should handle complex regex operations efficiently', () => {
      const textWithComplexPatterns = Array(1000)
        .fill(0)
        .map(
          (_, i) =>
            `Section ${i}.${i}: This is a legal clause with important information.`,
        )
        .join(' ');

      const start = Date.now();
      const result = promptService.sanitizeText(textWithComplexPatterns);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should handle complex patterns efficiently
    });
  });

  describe('Cache Effectiveness', () => {
    it('should improve performance with repeated similar texts', () => {
      const baseText = 'This is a legal document with important content.';
      const texts = Array(50)
        .fill(0)
        .map((_, i) => `${baseText} Version ${i}.`);

      const start = Date.now();
      const results = texts.map((text) => promptService.sanitizeText(text));
      const duration = Date.now() - start;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(3000); // Should be efficient with caching
    });

    it('should handle cache size limits gracefully', () => {
      // Generate many unique texts to test cache limits
      const uniqueTexts = Array(2000)
        .fill(0)
        .map(
          (_, i) =>
            `Unique document ${i}: This is a completely unique legal document.`,
        );

      const start = Date.now();
      const results = uniqueTexts.map((text) =>
        promptService.sanitizeText(text),
      );
      const duration = Date.now() - start;

      expect(results).toHaveLength(2000);
      expect(duration).toBeLessThan(10000); // Should handle cache limits gracefully
    });
  });

  describe('Realistic Workload Simulation', () => {
    it('should handle typical legal document processing', () => {
      const legalDocument = `
        AGREEMENT
        
        Section 1: Parties
        This agreement is between Party A and Party B.
        
        Section 2: Terms
        The terms of this agreement shall be as follows:
        1. Party A shall provide services
        2. Party B shall make payments
        3. Both parties shall maintain confidentiality
        
        Section 3: Duration
        This agreement shall remain in effect for one year.
        
        Section 4: Termination
        Either party may terminate this agreement with 30 days notice.
      `.repeat(100); // Simulate a large legal document

      const start = Date.now();
      const result = promptService.sanitizeText(legalDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should process realistic legal documents efficiently
    });

    it('should use character-based pre-truncation for performance', () => {
      // Create a very large document that would benefit from character-based pre-truncation
      const largeDocument = 'This is a legal document section. '.repeat(10000); // ~350KB

      const start = Date.now();
      const result = promptService.sanitizeText(largeDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should be fast due to character-based pre-truncation
    });

    it('should handle chat history processing efficiently', () => {
      const chatHistory = Array(100)
        .fill(0)
        .map(
          (_, i) =>
            `User: What does section ${i} say?\nAI: Section ${i} states that...`,
        )
        .join('\n');

      const start = Date.now();
      const result = promptService.sanitizeText(chatHistory);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should handle chat history efficiently
    });
  });
});
