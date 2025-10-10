import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../config/logger.config';
import { PromptService } from '../services/prompt.service';
import { ITokenizer } from '@interfaces/tokenizer.interface';
import {
  MAX_INPUT_SIZE,
  LARGE_DOCUMENT_THRESHOLD,
} from '@config/prompt.config';

// Mock tokenizer with realistic performance characteristics
const mockTokenizer: ITokenizer = {
  countTokens: vi.fn(async (text: string) => {
    // Simulate realistic tokenization time
    const tokens = Math.ceil(text.length / 4);
    // Simulate 1ms per 1000 characters
    const delay = Math.ceil(text.length / 1000);

    // Simulate the delay by awaiting a timeout
    await new Promise((resolve) => setTimeout(resolve, delay));

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
    it('should reject document exceeding size limit', () => {
      const largeDocument = 'A'.repeat(MAX_INPUT_SIZE + 1);

      expect(() => promptService.sanitizeText(largeDocument)).toThrow();
    });

    it('should process 1MB document efficiently', async () => {
      const mediumDocument = 'This is a legal document. '.repeat(40000); // ~1MB

      const start = Date.now();
      const result = await promptService.sanitizeText(mediumDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should handle documents with many sentences', async () => {
      const manySentences = Array(1000)
        .fill(0)
        .map(
          (_, i) =>
            `This is sentence ${i + 1} of a legal document. It contains important information.`,
        )
        .join(' ');

      const start = Date.now();
      const result = await promptService.sanitizeText(manySentences);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(3000); // Less than 3 seconds
    });
  });

  describe('Token Counting Efficiency', () => {
    it('should cache tokenization results', async () => {
      const input = {
        question: 'What is the main point of this document?',
        context: 'This is a test document for tokenization caching.',
        chatHistory: [],
      };

      // Clear any existing cache to ensure clean test
      const service = promptService as unknown as {
        tokenCache: Map<string, number>;
        tokenizationCount: number;
      };
      service.tokenCache.clear();
      service.tokenizationCount = 0;

      // First call
      const result1 = await promptService.mainPrompt(input);

      // Second call with same input
      const result2 = await promptService.mainPrompt(input);

      expect(result1).toBe(result2);

      // Verify tokenizer was called only once due to caching
      expect(mockTokenizer.countTokens).toHaveBeenCalledTimes(1);
    });

    it('should handle repeated tokenization efficiently', async () => {
      const texts = Array(100)
        .fill(0)
        .map(
          (_, i) =>
            `Document ${i}: This is a legal document with important content.`,
        );

      const start = Date.now();
      const results = await Promise.all(
        texts.map((text) => promptService.sanitizeText(text)),
      );
      const duration = Date.now() - start;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Less than 5 seconds for 100 documents
    });
  });

  describe('Memory Usage Patterns (Experimental)', () => {
    it('should not leak memory with repeated operations (requires --expose-gc)', async () => {
      // Skip if global.gc is not available
      const gc = (global as { gc?: () => void }).gc;
      if (typeof gc !== 'function') {
        logger.debug(
          'Skipping memory test: global.gc not available. Run with --expose-gc flag.',
        );
        return;
      }
      // This test requires Node.js to be run with --expose-gc flag
      // It's designed for manual performance profiling and CI performance monitoring
      const text = 'This is a test document for memory leak detection.';

      // Warm-up phase to stabilize memory
      for (let i = 0; i < 100; i++) {
        await promptService.sanitizeText(text);
      }

      // Force garbage collection and wait for it to complete
      gc();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const result = await promptService.sanitizeText(text);
        expect(result).toBeDefined();
      }

      // Force garbage collection again and wait
      gc();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Allow some growth, but flag excessive increases
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024); // 5MB threshold (more conservative)
    });

    it('should handle large text without excessive memory usage (requires --expose-gc)', async () => {
      // Skip if global.gc is not available
      const gc = (global as { gc?: () => void }).gc;
      if (typeof gc !== 'function') {
        logger.debug(
          'Skipping memory test: global.gc not available. Run with --expose-gc flag.',
        );
        return;
      }
      // This test requires Node.js to be run with --expose-gc flag
      // It's designed for manual performance profiling and CI performance monitoring
      const largeText = 'A'.repeat(LARGE_DOCUMENT_THRESHOLD);

      // Warm-up phase
      await promptService.sanitizeText(largeText.substring(0, 1000));

      // Force garbage collection and wait
      gc();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialMemory = process.memoryUsage().heapUsed;

      const start = Date.now();
      const result = await promptService.sanitizeText(largeText);
      const duration = Date.now() - start;

      // Force garbage collection and wait
      gc();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryUsed = finalMemory - initialMemory;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should process efficiently
      expect(memoryUsed).toBeLessThan(20 * 1024 * 1024); // More conservative 20MB threshold
    });
  });

  describe('Timeout Enforcement', () => {
    it('should handle operations within timeout limits', async () => {
      const text = 'This is a normal document that should process quickly.';

      const start = Date.now();
      const result = await promptService.sanitizeText(text);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should fail fast on oversized inputs', () => {
      const oversizedInput = 'A'.repeat(MAX_INPUT_SIZE + 1);

      expect(() => promptService.sanitizeText(oversizedInput)).toThrow();
    });
  });

  describe('String Operations Performance', () => {
    it('should handle large string replacements efficiently', async () => {
      const textWithManyReplacements = 'Hello World '.repeat(10000);

      const start = Date.now();
      const result = await promptService.sanitizeText(textWithManyReplacements);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    it('should handle complex regex operations efficiently', async () => {
      const textWithComplexPatterns = Array(1000)
        .fill(0)
        .map(
          (_, i) =>
            `Section ${i}.${i}: This is a legal clause with important information.`,
        )
        .join(' ');

      const start = Date.now();
      const result = await promptService.sanitizeText(textWithComplexPatterns);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should handle complex patterns efficiently
    });
  });

  describe('Cache Effectiveness', () => {
    it('should improve performance with repeated similar texts', async () => {
      const baseText = 'This is a legal document with important content.';
      const texts = Array(50)
        .fill(0)
        .map((_, i) => `${baseText} Version ${i}.`);

      const start = Date.now();
      const results = await Promise.all(
        texts.map((text) => promptService.sanitizeText(text)),
      );
      const duration = Date.now() - start;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(3000); // Should be efficient with caching
    });

    it('should handle cache size limits gracefully', async () => {
      // Generate many unique texts to test cache limits
      const uniqueTexts = Array(2000)
        .fill(0)
        .map(
          (_, i) =>
            `Unique document ${i}: This is a completely unique legal document.`,
        );

      const start = Date.now();
      const results = await Promise.all(
        uniqueTexts.map((text) => promptService.sanitizeText(text)),
      );
      const duration = Date.now() - start;

      expect(results).toHaveLength(2000);
      expect(duration).toBeLessThan(10000); // Should handle cache limits gracefully
    });
  });

  describe('Realistic Workload Simulation', () => {
    it('should handle typical legal document processing', async () => {
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
      const result = await promptService.sanitizeText(legalDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(2000); // Should process realistic legal documents efficiently
    });

    it('should use character-based pre-truncation for performance', async () => {
      // Create a very large document that would benefit from character-based pre-truncation
      const largeDocument = 'This is a legal document section. '.repeat(10000); // ~350KB

      const start = Date.now();
      const result = await promptService.sanitizeText(largeDocument);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should be fast due to character-based pre-truncation
    });

    it('should handle chat history processing efficiently', async () => {
      const chatHistory = Array(100)
        .fill(0)
        .map(
          (_, i) =>
            `User: What does section ${i} say?\nAI: Section ${i} states that...`,
        )
        .join('\n');

      const start = Date.now();
      const result = await promptService.sanitizeText(chatHistory);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should handle chat history efficiently
    });
  });
});
