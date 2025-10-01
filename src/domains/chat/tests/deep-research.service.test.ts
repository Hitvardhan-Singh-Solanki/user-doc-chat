import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepResearchService } from '../services/deep-research.service';
import { PromptService } from '../services/prompt.service';
import { SimpleTokenizerAdapter } from '../../../infrastructure/external-services/ai/custom-tokenizer.adapter';

// Mock the dependencies
vi.mock('../services/prompt.service');
vi.mock(
  '../../../infrastructure/external-services/ai/custom-tokenizer.adapter',
);

describe('DeepResearchService', () => {
  let deepResearchService: DeepResearchService;
  let mockLLMService: any;
  let mockPromptService: any;
  let MockedPromptService: any;

  beforeEach(() => {
    // Create mock LLM service
    mockLLMService = {
      chunkText: vi.fn((text: string, chunkSize: number, overlap: number) => {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
      }),
      generateLowSummary: vi.fn(async (chunks: string[], _options: unknown) => {
        return chunks.map((chunk: string) => `Summary of: ${chunk}`).join(' ');
      }),
    };

    // Create mock prompt service instance
    mockPromptService = {
      sanitizeText: vi.fn(),
    };

    // Mock the PromptService constructor
    MockedPromptService = vi.mocked(PromptService);
    MockedPromptService.mockImplementation(() => mockPromptService);

    // Mock SimpleTokenizerAdapter
    vi.mocked(SimpleTokenizerAdapter).mockImplementation(() => ({}) as any);

    // Reset mocks before creating service instance to preserve constructor call counts
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with LLMService and PromptService', () => {
      const llmService = mockLLMService;
      const service = new DeepResearchService(llmService);

      expect(service).toBeInstanceOf(DeepResearchService);
      expect(MockedPromptService).toHaveBeenCalledTimes(1);
    });
  });

  describe('summarize', () => {
    it('should successfully summarize text', async () => {
      const inputText =
        'This is a long legal document with many clauses and provisions.';
      const sanitizedText =
        'This is a long legal document with many clauses and provisions.';
      const _prompt = 'Extract all legal clauses from the following text...';
      const expectedSummary =
        'Summary: The document contains legal clauses about provisions.';
      const chunks = [sanitizedText];

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(mockLLMService.generateLowSummary).toHaveBeenCalledWith(chunks, {
        temperature: 0.7,
      });
      expect(result).toBe(expectedSummary);
    });

    it('should handle whitespace-only text', async () => {
      const inputText = '   \\n\\t   ';
      const sanitizedText = '';
      const _prompt = 'Extract all legal clauses from the following text...';
      const expectedSummary = '';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(result).toBe(expectedSummary);
    });

    it('should handle text sanitization', async () => {
      const inputText =
        'Text with special characters: "smart quotes" and \'apostrophes\'';
      const sanitizedText =
        'Text with special characters: "smart quotes" and \'apostrophes\'';
      const _prompt = 'Extract all legal clauses from the following text...';
      const expectedSummary = 'Sanitized summary of the text.';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(result).toBe(expectedSummary);
    });

    it('should handle very long text', async () => {
      const inputText = 'A'.repeat(10000);
      const sanitizedText = 'A'.repeat(10000);
      const _prompt = 'Extract all legal clauses from the following text...';
      const expectedSummary = 'Summary of very long text.';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(result).toBe(expectedSummary);
    });

    it('should handle LLM service errors', async () => {
      const inputText = 'Some legal text';
      const sanitizedText = 'Some legal text';
      const _prompt = 'Extract all legal clauses from the following text...';
      const llmError = new Error('LLM service unavailable');

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockRejectedValue(llmError);

      const service = new DeepResearchService(mockLLMService);
      await expect(service.summarize(inputText)).rejects.toThrow(
        'LLM service unavailable',
      );

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(mockLLMService.generateLowSummary).toHaveBeenCalledWith(
        [sanitizedText],
        { temperature: 0.7 },
      );
    });

    it('should handle prompt service sanitization errors', async () => {
      const inputText = 'Some text';
      const sanitizationError = new Error('Sanitization failed');

      mockPromptService.sanitizeText.mockImplementation(() => {
        throw sanitizationError;
      });

      const service = new DeepResearchService(mockLLMService);
      await expect(service.summarize(inputText)).rejects.toThrow(
        'Sanitization failed',
      );

      expect(mockPromptService.sanitizeText).toHaveBeenCalledWith(inputText);
      expect(mockLLMService.generateLowSummary).not.toHaveBeenCalled();
    });

    it('should use correct parameters for generateLowSummary', async () => {
      const inputText = 'Legal document text';
      const sanitizedText = 'Legal document text';
      const prompt = 'Extract clauses...';
      const expectedSummary = 'Document summary';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      await service.summarize(inputText);

      expect(mockLLMService.generateLowSummary).toHaveBeenCalledWith(
        [sanitizedText],
        { temperature: 0.7 },
      );
    });

    it('should pass through LLM generateLowSummary result unchanged', async () => {
      const inputText = 'Test text';
      const sanitizedText = 'Test text';
      const prompt = 'Test prompt';
      const llmResult = 'Complex object result';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockResolvedValue(llmResult);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(result).toBe(llmResult);
    });

    it('should handle special legal text patterns', async () => {
      const inputText = `
        ARTICLE 1. DEFINITIONS
        Section 1.1 Definitions
        For purposes of this Agreement:
        
        ARTICLE 2. OBLIGATIONS
        Section 2.1 Party A Obligations
        Party A shall...
      `;
      const sanitizedText = inputText.trim();
      const prompt = 'Extract legal clauses...';
      const expectedSummary =
        'Contains 2 articles with definitions and obligations.';

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);

      mockLLMService.generateLowSummary.mockResolvedValue(expectedSummary);

      const service = new DeepResearchService(mockLLMService);
      const result = await service.summarize(inputText);

      expect(result).toBe(expectedSummary);
    });
  });

  describe('Integration behavior', () => {
    it('should maintain proper service dependencies', () => {
      const service = new DeepResearchService(mockLLMService);

      // The service should have created a new PromptService instance
      expect(MockedPromptService).toHaveBeenCalledTimes(1);
      expect(service).toBeInstanceOf(DeepResearchService);
    });

    it('should handle async operations correctly', async () => {
      const inputText = 'Test async behavior';
      const sanitizedText = 'Test async behavior';
      const prompt = 'Async prompt';
      let resolvePromise: (value: string) => void;

      const summaryPromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      mockPromptService.sanitizeText.mockReturnValue(sanitizedText);
      mockLLMService.generateLowSummary.mockReturnValue(summaryPromise);

      const service = new DeepResearchService(mockLLMService);
      const resultPromise = service.summarize(inputText);

      // Resolve the LLM promise after a delay
      setTimeout(() => {
        resolvePromise!('Delayed summary');
      }, 10);

      const result = await resultPromise;
      expect(result).toBe('Delayed summary');
    });
  });
});
