import { InferenceClient } from '@huggingface/inference';
import { z } from 'zod';
import CircuitBreaker from 'opossum';
import { PromptConfig } from '@shared/types';
import { PromptService } from './prompt.service';
import { UserInputSchema } from '@auth/validators/user-input.validator';
import { LowContentSchema } from '@files/validators/file-input.validator';
import { IEnrichmentService } from '@interfaces/enrichment.interface';
import { logger } from '@config/logger.config';
import { createCircuitBreaker } from '@utils/circuit-breaker';
import { XenovaTokenizerAdapter } from '@ai/xenova.adapter';
import { SimpleTokenizerAdapter } from '@ai/custom-tokenizer.adapter';
import { config } from '@config';
import { secretsManager } from '@secrets';

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
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.message?.includes('timed out after')) {
      throw err;
    }

    if (
      controller.signal.aborted ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
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
      if (controller.signal.aborted) {
        throw new Error(
          `${operationName} request timed out after ${timeoutMs}ms`,
        );
      }

      yield item;
    }

    clearTimeout(timeoutId);
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.message?.includes('timed out after')) {
      throw err;
    }

    if (
      controller.signal.aborted ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
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

  private readonly CHAT_COMPLETION_TIMEOUT_MS = 30_000;
  private readonly TEXT_GENERATION_TIMEOUT_MS = 30_000;

  constructor() {
    this.hfToken = secretsManager.getHuggingfaceToken();
    this.hfChatModel = config.HUGGINGFACE_CHAT_MODEL;
    this.hfEmbeddingModel = config.HUGGINGFACE_EMBEDDING_MODEL;
    this.pythonUrl = config.PYTHON_LLM_URL;
    this.hfSummaryModel = config.HUGGINGFACE_SUMMARY_MODEL;

    const simpleTokenizer = new SimpleTokenizerAdapter();
    this.promptService = new PromptService(simpleTokenizer);

    const xenovaAdapter = new XenovaTokenizerAdapter(this.hfChatModel);

    this.tokenizerReady = xenovaAdapter
      .init()
      .then(() => {
        logger.info('Xenova tokenizer initialized successfully');
        this.promptService = new PromptService(xenovaAdapter);
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to initialize Xenova tokenizer');
        throw err;
      });

    this.inferenceClient = new InferenceClient(this.hfToken);

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
    chunkSize: number = config.CHUNK_SIZE,
    overlap: number = config.CHUNK_OVERLAP,
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
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new Error(
        `Python embed API request ${isAbort ? 'timed out' : 'failed'}: ${
          err instanceof Error ? err.message : String(err)
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
      (response[0] as number[]).every((n) => typeof n === 'number')
    )
      return response[0] as number[];

    throw new Error('Unexpected HuggingFace embeddings shape');
  }

  public async getEmbedding(text: string): Promise<number[]> {
    try {
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

  async *generateAnswerStreamWithEnrichment(
    userInput: z.infer<typeof UserInputSchema>,
    enrichedContext: string,
    config?: PromptConfig,
  ) {
    if (!this.hfToken) throw new Error('HuggingFace token missing');

    const promptService = await this.getPromptService();

    const prompt = promptService.mainPrompt(
      {
        question: userInput.question,
        context: enrichedContext,
        chatHistory: userInput.chatHistory ?? [],
      },
      config,
    );

    try {
      const resolvedPrompt = await prompt;
      const stream = withStreamTimeout(
        () =>
          this.inferenceClient.chatCompletionStream({
            model: this.hfChatModel,
            messages: [{ role: 'user', content: resolvedPrompt }],
            max_tokens: 1000,
            temperature: 0.1,
          }),
        this.CHAT_COMPLETION_TIMEOUT_MS,
        'chat completion with enrichment',
      );

      for await (const chunk of stream) {
        if (chunk.choices?.[0]?.delta?.content) {
          yield chunk.choices[0].delta.content;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in enriched answer generation');
      throw err;
    }
  }

  async *generateAnswerStream(
    userInput: z.infer<typeof UserInputSchema>,
    config?: PromptConfig,
  ) {
    if (!this.hfToken) throw new Error('HuggingFace token missing');

    const promptService = await this.getPromptService();

    const prompt = promptService.mainPrompt(userInput, config);

    try {
      const resolvedPrompt = await prompt;
      const stream = withStreamTimeout(
        () =>
          this.inferenceClient.chatCompletionStream({
            model: this.hfChatModel,
            messages: [{ role: 'user', content: resolvedPrompt }],
          }),
        this.CHAT_COMPLETION_TIMEOUT_MS,
        'Chat completion stream',
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during chat completion stream');
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

    const resolvedPrompt = await prompt;
    const chatCompletionPromise = this.inferenceClient.chatCompletion({
      model: this.hfSummaryModel,
      messages: [{ role: 'user', content: resolvedPrompt }],
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
