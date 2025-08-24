import {
  FeatureExtractionPipeline,
  pipeline,
  Tensor,
} from "@xenova/transformers";

class LLMService {
  private embedPipeline: FeatureExtractionPipeline | null = null;
  private ready: Promise<void> | null = null;

  async init() {
    if (!this.ready) {
      this.ready = (async () => {
        this.embedPipeline = await pipeline(
          "feature-extraction",
          process.env.HUGGINGFACE_EMBEDDING_MODEL!,
          {
            quantized: false, // prevent looking for model_quantized.onnx
          }
        );
        console.log("Embedding model loaded successfully");
      })();
    }
    return this.ready;
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.ready) await this.init();
    console.log("Generating embedding for text of length:", text.length);
    console.log(
      "Using embedding model:",
      process.env.HUGGINGFACE_EMBEDDING_MODEL
    );
    console.log(
      "Huggingface Hub Token Set:",
      !!process.env.HUGGINGFACE_HUB_TOKEN
    );
    console.log(
      this.embedPipeline
        ? "Embed pipeline is initialized"
        : "Embed pipeline is NOT initialized"
    );
    if (!this.embedPipeline) throw new Error("Embedding model not initialized");

    const embeddings: Tensor = await this.embedPipeline(text);

    const flatData = embeddings.data as Float32Array;
    const numTokens = embeddings.dims[0];
    const embeddingDim = embeddings.dims[1];

    const tokens: number[][] = [];
    for (let i = 0; i < numTokens; i++) {
      const tokenVector: number[] = [];
      for (let j = 0; j < embeddingDim; j++) {
        tokenVector.push(flatData[i * embeddingDim + j]);
      }
      tokens.push(tokenVector);
    }

    const meanEmbedding = Array(embeddingDim)
      .fill(0)
      .map(
        (_, j) => tokens.reduce((sum, token) => sum + token[j], 0) / numTokens
      );

    console.log("Generated embedding of dimension:", meanEmbedding.length);

    if (process.env.PINECONE_DIMENSION) {
      const expectedDim = parseInt(process.env.PINECONE_DIMENSION);
      if (meanEmbedding.length !== expectedDim) {
        throw new Error(
          `Embedding dimension mismatch. Expected ${expectedDim}, got ${meanEmbedding.length}`
        );
      }
    }
    return meanEmbedding;
  }
}

export const llmService = new LLMService();
