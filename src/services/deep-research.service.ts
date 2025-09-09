import { IDeepResearch } from "../interfaces/deep-research.interface";
import { LLMService } from "./llm.service";
import { PromptService } from "./prompt.service";

export class DeepResearchService implements IDeepResearch {
  private readonly llmService: LLMService;
  private readonly promptService: PromptService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
    this.promptService = new PromptService();
  }

  public async summarize(text: string): Promise<string> {
    if (!text || !text.trim()) return "";

    try {
      const sanitized = this.promptService.sanitizeText(text);

      const chunks = this.llmService.chunkText(
        sanitized,
        Number(process.env.CHUNK_SIZE) || 1000,
        Number(process.env.CHUNK_OVERLAP) || 100
      );

      const summary = await this.llmService.generateLowSummary(chunks, {
        temperature: 0.7,
      });

      return summary;
    } catch (err) {
      throw err;
    }
  }
}
