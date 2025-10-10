import { IDeepResearch } from '../../../shared/interfaces/deep-research.interface';
import { LLMService } from './llm.service';
import { PromptService } from './prompt.service';
import { SimpleTokenizerAdapter } from '../../../infrastructure/external-services/ai/custom-tokenizer.adapter';
import { config } from '../../../config/app.config';

export class DeepResearchService implements IDeepResearch {
  private readonly llmService: LLMService;
  private readonly promptService: PromptService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
    this.promptService = new PromptService(new SimpleTokenizerAdapter());
  }

  public async summarize(text: string): Promise<string> {
    if (!text || !text.trim()) return '';

    const sanitized = this.promptService.sanitizeText(text);

    const chunks = this.llmService.chunkText(
      sanitized,
      config.CHUNK_SIZE,
      config.CHUNK_OVERLAP,
    );

    return await this.llmService.generateLowSummary(chunks, {
      temperature: 0.7,
    });
  }
}
