import { InferenceClient } from '@huggingface/inference';
import { z } from 'zod';
import CircuitBreaker from 'opossum';
import { PromptConfig, SearchResult } from '../../../shared/types';
import { PromptService } from './prompt.service';
import { UserInputSchema } from '../../../domains/auth/validators/user-input.validator';
import { LowContentSchema } from '../../../domains/files/validators/file-input.validator';
import { IEnrichmentService } from '../../../shared/interfaces/enrichment.interface';
import { logger } from '../../../config/logger.config';
import { createCircuitBreaker } from '../../../shared/utils/cb';
import { XenovaTokenizerAdapter } from '../../../infrastructure/external-services/ai/xenova.adapter';
import { SimpleTokenizerAdapter } from '../../../infrastructure/external-services/ai/custom-tokenizer.adapter';

/**
 * Wraps a promise with timeout handling using AbortController
 * @param promise The promise to wrap with timeout
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation for error messages
 * @returns Promise that rejects with timeout error if timeout is exceeded
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(
            new Error(
              `${operationName} request timed out after ${timeoutMs}ms`,
            ),
          );
        });
      }),
    ]);

    clearTimeout(timeoutId);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);

    // If the error is from our timeout, re-throw it
    if (err.message?.includes('timed out after')) {
      throw err;
    }

    // For other errors, check if they're abort-related
    if (controller.signal.aborted || err.name === 'AbortError') {
      throw new Error(
        `${operationName} request timed out after ${timeoutMs}ms`,
      );
    }

    throw err;
  }
}

/**
 * Wraps an async generator with timeout handling
 * @param generatorFactory Function that returns the async generator
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation for error messages
 * @returns Async generator that throws timeout error if timeout is exceeded
 */
async function* withStreamTimeout<T>(
  generatorFactory: () => AsyncGenerator<T>,
  timeoutMs: number,
  operationName: string,
): AsyncGenerator<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const generator = generatorFactory();

    for await (const item of generator) {
      // Check if we've been aborted
      if (controller.signal.aborted) {
        throw new Error(
          `${operationName} request timed out after ${timeoutMs}ms`,
        );
      }

      yield item;
    }

    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);

    // If the error is from our timeout, re-throw it
    if (err.message?.includes('timed out after')) {
      throw err;
    }

    // For other errors, check if they're abort-related
    if (controller.signal.aborted || err.name === 'AbortError') {
      throw new Error(
        `${operationName} request timed out after ${timeoutMs}ms`,
      );
    }

    throw err;
  }
}

export class LLMService {
  private hfToken: string;
  private hfChatModel: string;
  private hfSummaryModel: string;
  private hfEmbeddingModel: string;
  private pythonUrl?: string;
  private promptService!: PromptService;
  private inferenceClient!: InferenceClient;
  private _enrichmentService!: IEnrichmentService;
  private embeddingBreaker!: CircuitBreaker<[string], number[]>;
  private readonly tokenizerReady: Promise<void>;
  private readonly circuitBreakerReady: Promise<void>;

  // Timeout configurations
  private readonly CHAT_COMPLETION_TIMEOUT_MS = 30_000; // 30 seconds
  private readonly TEXT_GENERATION_TIMEOUT_MS = 30_000; // 30 seconds

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_HUB_TOKEN || '';
    this.hfChatModel = process.env.HUGGINGFACE_CHAT_MODEL || '';
    this.hfEmbeddingModel = process.env.HUGGINGFACE_EMBEDDING_MODEL || '';
    this.pythonUrl = process.env.PYTHON_LLM_URL;
    this.hfSummaryModel = process.env.HUGGINGFACE_SUMMARY_MODEL || '';

    if (!this.hfToken) throw new Error('HUGGINGFACE_HUB_TOKEN is required');
    if (!this.hfChatModel)
      throw new Error('HUGGINGFACE_CHAT_MODEL is required');
    if (!this.hfEmbeddingModel)
      throw new Error('HUGGINGFACE_EMBEDDING_MODEL is required');
    if (!this.hfSummaryModel)
      throw new Error('HUGGINGFACE_SUMMARY_MODEL is required');

    // Initialize with SimpleTokenizerAdapter for immediate availability
    const simpleTokenizer = new SimpleTokenizerAdapter();
    this.promptService = new PromptService(simpleTokenizer);

    // Initialize Xenova tokenizer asynchronously
    const xenovaAdapter = new XenovaTokenizerAdapter(this.hfChatModel);

    this.tokenizerReady = xenovaAdapter
      .init()
      .then(() => {
        logger.info('Xenova tokenizer initialized successfully');
        this.promptService = new PromptService(xenovaAdapter);
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to initialize Xenova tokenizer');
        throw err; // Re-throw to reject the ready Promise
      });

    this.inferenceClient = new InferenceClient(this.hfToken);

    // Initialize circuit breaker after tokenizer is ready to ensure it only measures embedding call time
    this.circuitBreakerReady = this.tokenizerReady.then(() => {
      this.embeddingBreaker = createCircuitBreaker(
        this.embeddingHF.bind(this),
        {
          timeout: 5000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      this.embeddingBreaker.on('open', () =>
        logger.warn('LLM Embedding Circuit Breaker: OPEN'),
      );
      this.embeddingBreaker.on('halfOpen', () =>
        logger.info('LLM Embedding Circuit Breaker: HALF-OPEN'),
      );
      this.embeddingBreaker.on('close', () =>
        logger.info('LLM Embedding Circuit Breaker: CLOSED'),
      );
    });
  }

  set enrichmentService(enr: IEnrichmentService) {
    this._enrichmentService = enr;
  }

  /**
   * Ensures the tokenizer is ready before returning the prompt service.
   * This prevents race conditions where callers might get different tokenizers.
   * @returns Promise that resolves to the initialized PromptService
   */
  private async getPromptService(): Promise<PromptService> {
    await this.tokenizerReady;
    return this.promptService;
  }

  chunkText(
    text: string,
    chunkSize: number = Number(process.env.CHUNK_SIZE) || 500,
    overlap: number = Number(process.env.CHUNK_OVERLAP) || 50,
  ): string[] {
    const chunks: string[] = [];
    const size = Math.max(1, Math.floor(chunkSize));
    const ov = Math.max(0, overlap);
    const step = Math.max(1, size - ov);
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += step;
    }
    return chunks;
  }

  async embeddingPython(text: string, timeoutMs = 10_000): Promise<number[]> {
    if (!this.pythonUrl)
      throw new Error('PYTHON_LLM_URL environment variable is not set');

    const promptService = await this.getPromptService();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response | null = null;
    try {
      res = await fetch(this.pythonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text: promptService.sanitizeText(text) }),
      });
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      throw new Error(
        `Python embed API request ${isAbort ? 'timed out' : 'failed'}: ${
          err?.message ?? String(err)
        }`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res) {
      throw new Error(
        'Python embed API request failed before receiving a response',
      );
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`,
      );
    }

    const data = await res.json();
    const emb = data?.embedding;
    if (
      !Array.isArray(emb) ||
      !emb.every((n: unknown) => typeof n === 'number')
    ) {
      throw new Error('Python API returned invalid embeddings');
    }

    return emb as number[];
  }

  // Private method, protected by the circuit breaker
  private async embeddingHF(text: string): Promise<number[]> {
    if (!this.hfToken || !this.hfEmbeddingModel)
      throw new Error('HuggingFace token or embedding model missing');

    const promptService = await this.getPromptService();
    const response = await this.inferenceClient.featureExtraction({
      model: this.hfEmbeddingModel,
      inputs: promptService.sanitizeText(text),
    });

    if (!Array.isArray(response))
      throw new Error('HuggingFace API returned invalid embeddings');

    if (response.length > 0 && typeof response[0] === 'number')
      return response as number[];
    if (
      Array.isArray(response[0]) &&
      (response[0] as any[]).every((n) => typeof n === 'number')
    )
      return response[0] as number[];

    throw new Error('Unexpected HuggingFace embeddings shape');
  }

  // 🚀 Public method to be called by other services
  public async getEmbedding(text: string): Promise<number[]> {
    try {
      // Ensure circuit breaker is ready before using it
      await this.circuitBreakerReady;
      return await this.embeddingBreaker.fire(text);
    } catch (err) {
      logger.error(
        { err, isBreaker: this.embeddingBreaker?.opened },
        'LLM Embedding call failed via circuit breaker',
      );
      throw err;
    }
  }

  async *generateAnswerStream(
    userInput: z.infer<typeof UserInputSchema>,
    config?: PromptConfig,
  ) {
    if (!this.hfToken) throw new Error('HuggingFace token missing');

    const promptService = await this.getPromptService();

    // Check for enrichment before any streaming
    let enrichmentResults: SearchResult[] | null = null;
    let shouldUseEnrichedPrompt = false;

    try {
      if (this._enrichmentService) {
        // Call enrichment service with just the question to detect if enrichment is needed
        // Note: The interface expects both question and answer, but we're calling it early
        // with an empty answer to detect if enrichment should be used
        enrichmentResults = await this._enrichmentService.enrichIfUnknown(
          userInput.question,
          '', // Empty answer since we're checking before generation
        );
        shouldUseEnrichedPrompt = (enrichmentResults?.length ?? 0) > 0;
      }
    } catch (err) {
      logger.warn(
        { err },
        'Enrichment check failed; proceeding with original prompt',
      );
      // Safe fallback: continue with original prompt if enrichment check fails
    }

    // Build the appropriate prompt based on enrichment results
    let prompt: string;
    if (shouldUseEnrichedPrompt && enrichmentResults?.length) {
      const enrichedContext = enrichmentResults
        .map((r) => `${r.title}: ${r.snippet}`)
        .join('\n\n');

      prompt = promptService.mainPrompt(
        {
          question: userInput.question,
          context: enrichedContext,
          chatHistory: userInput.chatHistory ?? [],
        },
        config,
      );
    } else {
      prompt = promptService.mainPrompt(userInput, config);
    }

    // Stream the response (either enriched or original)
    try {
      const stream = withStreamTimeout(
        () =>
          this.inferenceClient.chatCompletionStream({
            model: this.hfChatModel,
            messages: [{ role: 'user', content: prompt }],
          }),
        this.CHAT_COMPLETION_TIMEOUT_MS,
        shouldUseEnrichedPrompt
          ? 'Enriched chat completion stream'
          : 'Chat completion stream',
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (err) {
      logger.error(
        { err },
        `Error during ${shouldUseEnrichedPrompt ? 'enriched ' : ''}chat completion stream`,
      );
      throw err;
    }
  }

  async generateLowSummary(
    lowContent: string[],
    config?: PromptConfig,
  ): Promise<string> {
    if (!this.hfToken) throw new Error('HuggingFace token missing');
    const promptService = await this.getPromptService();
    const prompt = promptService.lowPrompt(
      LowContentSchema.parse(lowContent),
      config,
    );

    const chatCompletionPromise = this.inferenceClient.chatCompletion({
      model: this.hfSummaryModel,
      messages: [{ role: 'user', content: prompt }],
    });

    const chatCompletionOut = await withTimeout(
      chatCompletionPromise,
      this.CHAT_COMPLETION_TIMEOUT_MS,
      'Chat completion for low summary',
    );

    return chatCompletionOut.choices[0]?.message?.content || '';
  }

  async buildPrompt(
    context: string,
    question: string,
    chatHistory: string[],
    config?: PromptConfig,
  ): Promise<string> {
    const sanitizedInput = UserInputSchema.parse({
      context,
      question,
      chatHistory,
    });
    const promptService = await this.getPromptService();
    return promptService.mainPrompt(sanitizedInput, config);
  }

  async buildLowPrompt(
    lowContent: string[],
    config?: PromptConfig,
  ): Promise<string> {
    const sanitizedContent = LowContentSchema.parse(lowContent);
    const promptService = await this.getPromptService();
    return promptService.lowPrompt(sanitizedContent, config);
  }

  async generateText(queryPrompt: string): Promise<string> {
    if (!this.hfToken) throw new Error('HuggingFace token missing');

    const textGenerationPromise = this.inferenceClient.textGeneration({
      model: this.hfSummaryModel,
      inputs: queryPrompt,
    });

    const text = await withTimeout(
      textGenerationPromise,
      this.TEXT_GENERATION_TIMEOUT_MS,
      'Text generation',
    );

    if (typeof text === 'string') return text;
    if (text?.generated_text) return text.generated_text;
    throw new Error('Unexpected text generation response');
  }
}
