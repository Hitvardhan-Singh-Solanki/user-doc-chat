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
    const sanitized = this.promptService.sanitizeText(text);

    const chunks = this.llmService.chunkText(
      sanitized,
      Number(process.env.CHUNK_SIZE) || 1000,
      Number(process.env.CHUNK_OVERLAP) || 100
    );

    const summary = this.llmService.generateLowSummary(chunks);

    return summary;
  }
}
