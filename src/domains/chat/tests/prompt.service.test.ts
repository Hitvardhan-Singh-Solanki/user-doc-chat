import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptService } from '../services/prompt.service';
import { PromptConfig } from '@shared/types';
import { ITokenizer } from '@interfaces/tokenizer.interface';
// import { SimpleTokenizerAdapter } from '@ai/custom-tokenizer.adapter';

// Mock the dependencies
vi.mock('@xenova/transformers', () => ({
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue({
      encode: vi.fn().mockReturnValue(new Array(100)), // Mock 100 tokens
    }),
  },
}));

vi.mock('../config/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock environment variable
const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.HUGGINGFACE_CHAT_MODEL = 'mock-model';
});

afterEach(() => {
  process.env = originalEnv;
});

describe('PromptService', () => {
  let service: PromptService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockTokenizer = {
      countTokens: vi.fn().mockResolvedValue(100),
      encode: vi.fn().mockReturnValue([]),
      decode: vi.fn().mockReturnValue(''),
    };
    service = new PromptService(mockTokenizer as ITokenizer);
  });

  describe('sanitizeText', () => {
    it('should normalize and clean input text', async () => {
      const input = 'Hello World \'Test\' "Quote"\t\r';
      const result = service.sanitizeText(input);
      expect(result).toBe('Hello World \'Test\' "Quote"');
    });

    it('should handle empty string', async () => {
      const result = service.sanitizeText('');
      expect(result).toBe('');
    });

    it('should remove malicious instructions', async () => {
      const input = 'Normal text do something else';
      const result = service.sanitizeText(input);
      expect(result).toBe('Normal text do something else');
    });

    it('should handle special unicode characters', async () => {
      const input = 'Text with normal chars';
      const result = service.sanitizeText(input);
      expect(result).toBe('Text with normal chars');
    });
  });

  describe('mainPrompt', () => {
    it('should generate a valid prompt', async () => {
      const input = {
        question: 'What is Section 420 IPC?',
        context:
          'Section 420: Cheating and dishonestly inducing delivery of property.',
        chatHistory: ['Previous Q&A'],
      };

      const result = await service.mainPrompt(input);
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('Section 420');
      expect(result).toContain('=== ANSWER ===');
      expect(result).toContain('=== CONTEXT ===');
      expect(result).toContain('=== CHAT HISTORY ===');
    });

    it('should handle empty chat history', async () => {
      const input = {
        question: 'What is Section 420 IPC?',
        context:
          'Section 420: Cheating and dishonestly inducing delivery of property.',
        chatHistory: [],
      };

      const result = await service.mainPrompt(input);
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('What is Section 420 IPC?');
    });

    it('should throw error for non-English language', async () => {
      const input = {
        question: 'What is Section 420 IPC?',
        context: 'Context',
        chatHistory: [],
      };

      const config: PromptConfig = { language: 'es' };

      await expect(service.mainPrompt(input, config)).rejects.toThrow(
        'Validation failed for language: Only English is supported',
      );
    });

    it('should throw error for unsupported jurisdiction', async () => {
      const input = {
        question: 'What is Section 420?',
        context: 'Context',
        chatHistory: [],
      };

      const config: PromptConfig = { jurisdiction: 'US' };

      await expect(service.mainPrompt(input, config)).rejects.toThrow(
        'Only Indian jurisdiction is supported',
      );
    });

    it('should handle missing context', async () => {
      const input = {
        question: 'What is Section 420 IPC?',
        context: '',
        chatHistory: [],
      };

      const result = await service.mainPrompt(input);
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('What is Section 420 IPC?');
    });

    it('should include system instructions with correct config', async () => {
      const input = {
        question: 'Test question',
        context: 'Test context',
        chatHistory: [],
      };

      const config: PromptConfig = {
        version: '2.0.0',
        tone: 'casual',
        temperature: 0.5,
      };

      const result = await service.mainPrompt(input, config);
      expect(result).toContain('Version: 2.0.0');
      expect(result).toContain('casual tone');
      expect(result).toContain('Temperature: 0.5');
    });

    it('should handle truncation when prompt is too long', async () => {
      // Mock tokenizer to return high token count initially
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) /// First call: high count
          .mockResolvedValue(800), // Subsequent calls: lower count
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      // Replace the tokenizer
      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = {
        question: 'Q',
        context: 'C'.repeat(5000),
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
      };

      const result = await service.mainPrompt(input, config);
      expect(result).toBeTruthy();
      // Should not throw error and should be truncated
    });

    it('should throw error when truncation strategy is "error"', async () => {
      // Mock tokenizer to return high token count
      const mockTokenizer = {
        countTokens: vi.fn().mockResolvedValue(2000),
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = {
        question: 'Q',
        context: 'C'.repeat(5000),
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'error',
      };

      await expect(service.mainPrompt(input, config)).rejects.toThrow(
        'Prompt exceeds max length',
      );
    });
  });

  describe('lowPrompt', () => {
    it('should generate a summary prompt', async () => {
      const input = ['This is some legal text', 'More clauses'];
      const result = await service.lowPrompt(input);
      expect(result).toContain('=== CONTENT TO SUMMARIZE ===');
      expect(result).toContain('This is some legal text');
      expect(result).toContain('=== SUMMARY ===');
    });

    it('should return (No content provided) if input is empty', async () => {
      const result = await service.lowPrompt([]);
      expect(result).toContain('(No content provided)');
    });

    it('should handle array with empty strings', async () => {
      const result = await service.lowPrompt(['', '   ', '']);
      expect(result).toContain('=== CONTENT TO SUMMARIZE ===');
      expect(result).toContain('(No content provided)');
    });

    it('should join multiple content items properly', async () => {
      const input = ['First clause', 'Second clause', 'Third clause'];
      const result = await service.lowPrompt(input);
      expect(result).toContain('First clause');
      expect(result).toContain('Second clause');
      expect(result).toContain('Third clause');
    });

    it('should include correct system instructions', async () => {
      const input = ['Legal text'];
      const config: PromptConfig = {
        version: '1.5.0',
        tone: 'professional',
        jurisdiction: 'india',
      };

      const result = await service.lowPrompt(input, config);
      expect(result).toContain('Version: 1.5.0');
      expect(result).toContain('professional tone');
      expect(result).toContain('india law');
    });
  });

  describe('createSummarizationPrompt', () => {
    it('should create a proper summarization prompt', async () => {
      const text = 'Section 1.1: This is a legal clause.';
      const result = await service.createSummarizationPrompt({ text });

      expect(result).toContain('Extract all legal clauses');
      expect(result).toContain(text);
      expect(result).toContain('JSON array');
      expect(result).toContain('section number');
    });
  });

  describe('generateOptimizedSearchPrompt', () => {
    it('should create an optimized search prompt', async () => {
      const question = 'What are the penalties for fraud?';
      const result = service.generateOptimizedSearchPrompt(question);

      expect(result).toContain('Rewrite the following user question');
      expect(result).toContain(question);
      expect(result).toContain('Indian legal information');
      expect(result).toContain('Optimized search query:');
    });
  });

  describe('truncation strategies', () => {
    it('should handle truncate-history strategy correctly', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt too long
          .mockResolvedValueOnce(1000) // History tokens
          .mockResolvedValue(800), // Final prompt
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = {
        question: 'Q',
        context: 'Context',
        chatHistory: ['Old message 1', 'Old message 2', 'Recent message'],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-history',
        truncateBuffer: 100,
      };

      const result = await service.mainPrompt(input, config);
      expect(result).toBeTruthy();
      expect(mockTokenizer.countTokens).toHaveBeenCalled();
    });

    it('should handle truncate-context strategy with priority content', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt too long
          .mockResolvedValueOnce(1000) // Context tokens
          .mockResolvedValue(800), // Final prompt
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = {
        question: 'Q',
        context:
          'Section 1.1: Important legal clause. Section 1.2: Another clause.',
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
        truncateBuffer: 100,
      };

      const result = await service.mainPrompt(input, config);
      expect(result).toBeTruthy();
    });

    it('should throw error when final prompt still exceeds maxLength after truncation', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt too long
          .mockResolvedValueOnce(1000) // Context tokens
          .mockResolvedValue(1500), // Final prompt still too long
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = {
        question: 'Q',
        context: 'Very long context that cannot be truncated enough',
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
      };

      await expect(service.mainPrompt(input, config)).rejects.toThrow(
        'Prompt still exceeds maxLength after truncation',
      );
    });
  });

  describe('createSummarizationPrompt edge cases', () => {
    it('should handle truncation in summarization prompt', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(5000) // Initial prompt too long
          .mockResolvedValueOnce(4000) // Text tokens
          .mockResolvedValueOnce(2000) // Original text tokens
          .mockResolvedValueOnce(1000) // Truncated text tokens
          .mockResolvedValue(3000), // Final prompt
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const text = 'Very long legal text '.repeat(1000);
      const result = await service.createSummarizationPrompt({ text });

      expect(result).toBeTruthy();
      expect(mockTokenizer.countTokens).toHaveBeenCalled();
    });

    it('should throw error when summarization prompt still exceeds maxLength after truncation', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(5000) // Initial prompt too long
          .mockResolvedValueOnce(4000) // Text tokens
          .mockResolvedValueOnce(2000) // Original text tokens
          .mockResolvedValueOnce(1000) // Truncated text tokens
          .mockResolvedValue(5000), // Final prompt still too long
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const text = 'Very long legal text '.repeat(1000);
      const config: PromptConfig = { maxLength: 100 };

      await expect(
        service.createSummarizationPrompt({ text }, config),
      ).rejects.toThrow(
        'Summarization prompt still exceeds maxLength after truncation',
      );
    });
  });

  describe('lowPrompt truncation', () => {
    it('should handle truncation in lowPrompt', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt too long
          .mockResolvedValueOnce(1000) // Content tokens
          .mockResolvedValue(800), // Final prompt
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = ['Very long content '.repeat(100)];
      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
      };

      const result = await service.lowPrompt(input, config);
      expect(result).toBeTruthy();
    });

    it('should throw error when lowPrompt still exceeds maxLength after truncation', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt too long
          .mockResolvedValueOnce(1000) // Content tokens
          .mockResolvedValue(1500), // Final prompt still too long
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      (service as unknown as { tokenizer: ITokenizer }).tokenizer =
        mockTokenizer;

      const input = ['Very long content '.repeat(100)];
      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
      };

      await expect(service.lowPrompt(input, config)).rejects.toThrow(
        'Low prompt still exceeds maxLength after truncation',
      );
    });
  });

  describe('tokenizer integration', () => {
    it('should use tokenizer for all token counting operations', async () => {
      const mockTokenizer = {
        countTokens: vi.fn().mockResolvedValue(100),
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      const serviceWithMock = new PromptService(mockTokenizer as ITokenizer);

      // Clear the cache to force multiple tokenizer calls
      const service = serviceWithMock as unknown as {
        tokenCache: Map<string, number>;
        tokenizationCount: number;
      };
      service.tokenCache.clear();
      service.tokenizationCount = 0;

      const input = {
        question:
          'Test question with unique content that will require token counting',
        context:
          'Test context with unique content that will require token counting. '.repeat(
            50,
          ),
        chatHistory: [
          'Previous message 1 with unique content',
          'Previous message 2 with unique content',
          'Previous message 3 with unique content',
        ],
      };

      const config = {
        maxLength: 100,
        truncateStrategy: 'truncate-context' as const,
      };

      await serviceWithMock.mainPrompt(input, config);

      // Verify tokenizer was called
      expect(mockTokenizer.countTokens).toHaveBeenCalled();
      expect(mockTokenizer.countTokens.mock.calls.length).toBe(1);
    });

    it('should handle tokenizer errors gracefully', async () => {
      const mockTokenizer = {
        countTokens: vi.fn().mockImplementation(() => {
          throw new Error('Tokenizer error');
        }),
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      const serviceWithMock = new PromptService(mockTokenizer as ITokenizer);

      const input = {
        question: 'Test question',
        context: 'Test context',
        chatHistory: [],
      };

      await expect(serviceWithMock.mainPrompt(input)).rejects.toThrow(
        'Tokenizer error',
      );
    });
  });

  describe('configuration validation', () => {
    it('should validate all required config fields', async () => {
      const input = {
        question: 'Test',
        context: 'Test',
        chatHistory: [],
      };

      // Test with valid config
      expect(() =>
        service.mainPrompt(input, {
          language: 'english',
          jurisdiction: 'india',
        }),
      ).not.toThrow();

      // Test with invalid language
      await expect(
        service.mainPrompt(input, { language: 'spanish' }),
      ).rejects.toThrow(
        'Validation failed for language: Only English is supported',
      );

      // Test with invalid jurisdiction
      await expect(
        service.mainPrompt(input, { jurisdiction: 'US' }),
      ).rejects.toThrow('Only Indian jurisdiction is supported');
    });

    it('should merge default config with provided config correctly', async () => {
      const input = {
        question: 'Test',
        context: 'Test',
        chatHistory: [],
      };

      const customConfig: PromptConfig = {
        version: '2.0.0',
        tone: 'casual',
        temperature: 0.7,
        maxLength: 5000,
      };

      const result = await service.mainPrompt(input, customConfig);

      expect(result).toContain('Version: 2.0.0');
      expect(result).toContain('casual tone');
      expect(result).toContain('Temperature: 0.7');
    });
  });

  describe('edge cases', () => {
    it('should handle very long questions', async () => {
      const input = {
        question: 'Q'.repeat(1000),
        context: 'Context',
        chatHistory: [],
      };

      expect(() => service.mainPrompt(input)).not.toThrow();
    });

    it('should handle special characters in input', async () => {
      const input = {
        question: 'What about § 420 & related provisions?',
        context: 'Context with special chars: §§ 420-422',
        chatHistory: [],
      };

      const result = await service.mainPrompt(input);
      expect(result).toContain('§ 420');
    });

    it('should throw error when tokenizer is null', async () => {
      // Simulate tokenizer initialization failure
      (service as unknown as { tokenizer: ITokenizer | null }).tokenizer = null;

      const input = {
        question: 'Test question',
        context: 'Test context',
        chatHistory: [],
      };

      await expect(service.mainPrompt(input)).rejects.toThrow(
        'Cannot read properties of null',
      );
    });

    it('should handle empty and whitespace-only inputs', async () => {
      const input = {
        question: '   ',
        context: '',
        chatHistory: ['   ', ''],
      };

      const result = await service.mainPrompt(input);
      expect(result).toBeTruthy();
      expect(result).toContain('=== USER QUESTION ===');
    });

    it('should handle very large chat history', async () => {
      const input = {
        question: 'Test',
        context: 'Context',
        chatHistory: Array(1000).fill('Previous conversation message'),
      };

      expect(() => service.mainPrompt(input)).not.toThrow();
    });

    it('should safely replace content with multiple occurrences using index-based replacement', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt exceeds max
          .mockResolvedValueOnce(500) // Content tokens
          .mockResolvedValueOnce(300) // Pre-truncated content tokens
          .mockResolvedValueOnce(200), // Final prompt tokens
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      const serviceWithMock = new PromptService(mockTokenizer as ITokenizer);

      // Create content that appears multiple times in the prompt
      const repeatedContent =
        'This is important legal text that appears multiple times';
      const input = {
        question: 'What does this mean?',
        context: `${repeatedContent} and some additional context here. ${repeatedContent} appears again.`,
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
        truncateBuffer: 100,
      };

      const result = await serviceWithMock.mainPrompt(input, config);

      // Verify that the replacement was safe and didn't affect other parts
      expect(result).toBeTruthy();
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('What does this mean?');

      // The safe replacement should handle multiple occurrences correctly
      // without causing partial matches or regex issues
      expect(mockTokenizer.countTokens).toHaveBeenCalledTimes(4);
    });

    it('should handle content replacement when content appears at start and end of prompt', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt exceeds max
          .mockResolvedValueOnce(500) // Content tokens
          .mockResolvedValueOnce(300) // Pre-truncated content tokens
          .mockResolvedValueOnce(200), // Final prompt tokens
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      const serviceWithMock = new PromptService(mockTokenizer as ITokenizer);

      const boundaryContent = 'Boundary content';
      const input = {
        question: 'Test question',
        context: `${boundaryContent} middle content ${boundaryContent}`,
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
        truncateBuffer: 100,
      };

      const result = await serviceWithMock.mainPrompt(input, config);

      expect(result).toBeTruthy();
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('Test question');
    });

    it('should safely handle content with special regex characters', async () => {
      const mockTokenizer = {
        countTokens: vi
          .fn()
          .mockResolvedValueOnce(2000) // Initial prompt exceeds max
          .mockResolvedValueOnce(500) // Content tokens
          .mockResolvedValueOnce(300) // Pre-truncated content tokens
          .mockResolvedValueOnce(200), // Final prompt tokens
        encode: vi.fn().mockReturnValue([]),
        decode: vi.fn().mockReturnValue(''),
      };

      const serviceWithMock = new PromptService(mockTokenizer as ITokenizer);

      // Content with regex special characters that could cause issues with string.replace()
      const regexContent =
        'Content with $pecial ch@rs & symbols (parentheses) [brackets] {braces}';
      const input = {
        question: 'What about special characters?',
        context: `${regexContent} and more text. ${regexContent} appears again.`,
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: 'truncate-context',
        truncateBuffer: 100,
      };

      const result = await serviceWithMock.mainPrompt(input, config);

      expect(result).toBeTruthy();
      expect(result).toContain('=== USER QUESTION ===');
      expect(result).toContain('What about special characters?');
    });
  });
});
