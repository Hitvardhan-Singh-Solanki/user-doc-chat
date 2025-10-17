import { InferenceClient } from '@huggingface/inference';
import CircuitBreaker from 'opossum';
import { PromptService } from './prompt.service';
import { logger } from '@config/logger.config';
import { createCircuitBreaker } from '@utils/circuit-breaker';
import { XenovaTokenizerAdapter } from '@ai/xenova.adapter';
import { secretsManager } from '@secrets';
import { TimeoutService } from '@shared/services/timeout.service';

export class LLMOrchestratorService {
  private readonly inferenceClient: InferenceClient;
  private readonly promptService: PromptService;
  private readonly tokenizer: XenovaTokenizerAdapter;
  private readonly timeoutService: TimeoutService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly logger = logger.child({
    component: 'LLMOrchestratorService',
  });

  constructor() {
    this.inferenceClient = new InferenceClient(
      secretsManager.getHuggingfaceToken(),
    );
    this.tokenizer = new XenovaTokenizerAdapter('Xenova/all-MiniLM-L6-v2');
    this.promptService = new PromptService(this.tokenizer);
    this.timeoutService = new TimeoutService();
    this.circuitBreaker = createCircuitBreaker(() =>
      Promise.resolve('llm-service'),
    );

    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    try {
      await this.tokenizer.init();
      this.logger.info('LLM services initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize LLM services');
      throw error;
    }
  }

  async generateResponse(request: {
    question: string;
    context: string;
    userId: string;
  }): Promise<string> {
    const log = this.logger.child({
      userId: request.userId,
      questionLength: request.question.length,
      contextLength: request.context.length,
    });

    try {
      const prompt = await this.promptService.mainPrompt({
        question: request.question,
        context: request.context,
        chatHistory: [],
      });

      const response = await this.timeoutService.withTimeout(
        this.circuitBreaker.fire(() => this.callLLM(prompt)),
        30000,
        'LLM generation',
      );

      log.info('LLM response generated successfully');
      return Array.isArray(response) ? response.join('') : String(response);
    } catch (error) {
      log.error({ error }, 'Failed to generate LLM response');
      throw error;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const log = this.logger.child({ textLength: text.length });

    try {
      const embedding = await this.timeoutService.withTimeout(
        this.circuitBreaker.fire(() =>
          this.inferenceClient.featureExtraction({
            model: 'Xenova/all-MiniLM-L6-v2',
            inputs: text,
          }),
        ),
        30000,
        'Embedding generation',
      );

      log.debug('Embedding generated successfully');
      return Array.isArray(embedding) ? embedding : [Number(embedding)];
    } catch (error) {
      log.error({ error }, 'Failed to generate embedding');
      throw error;
    }
  }

  async generateLowSummary(
    chunks: string[],
    options: { temperature?: number } = {},
  ): Promise<string> {
    const log = this.logger.child({ chunkCount: chunks.length });

    try {
      const summary = await this.timeoutService.withTimeout(
        this.circuitBreaker.fire(() =>
          this.inferenceClient.textGeneration({
            model: 'Xenova/LaMini-Flan-T5-248M',
            inputs: chunks.join('\n'),
            parameters: {
              max_new_tokens: 200,
              temperature: options.temperature || 0.7,
            },
          }),
        ),
        30000,
        'Summary generation',
      );

      log.debug('Summary generated successfully');
      return Array.isArray(summary) ? summary.join('') : String(summary);
    } catch (error) {
      log.error({ error }, 'Failed to generate summary');
      throw error;
    }
  }

  chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const tokens = this.tokenizer.encode(text);
    const chunks: string[] = [];

    for (let i = 0; i < tokens.length; i += chunkSize - chunkOverlap) {
      const chunkTokens = tokens.slice(i, i + chunkSize);
      const chunkText = this.tokenizer.decode(chunkTokens);
      chunks.push(chunkText);
    }

    return chunks;
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await this.inferenceClient.textGeneration({
      model: 'Xenova/LaMini-Flan-T5-248M',
      inputs: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
      },
    });

    return Array.isArray(response) ? response.join('') : String(response);
  }

  getMetrics() {
    return {
      timeout: this.timeoutService.getMetrics(),
      circuitBreaker: this.circuitBreaker.stats,
    };
  }
}
