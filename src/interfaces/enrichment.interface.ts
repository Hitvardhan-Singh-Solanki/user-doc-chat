export interface IEnrichmentService {
  enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string,
    options?: any
  ): Promise<any[] | null>;
}
