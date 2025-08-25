import { InferenceClient } from "@huggingface/inference";

export class LLMService {
  private hfToken: string;
  private hfChatModel: string;
  private pythonUrl?: string;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_HUB_TOKEN!;
    this.hfChatModel = process.env.HUGGINGFACE_CHAT_MODEL!;
    this.pythonUrl = process.env.PYTHON_LLM_URL;

    if (!this.hfToken || !this.hfChatModel) {
      throw new Error("HuggingFace token or chat model is missing in env");
    }
  }

  chunkText(
    text: string,
    chunkSize: number = Number(process.env.CHUNK_SIZE) || 500,
    overlap: number = Number(process.env.CHUNK_OVERLAP) || 50
  ): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + chunkSize));
      start += chunkSize - overlap;
    }
    return chunks;
  }

  async embeddingPython(text: string): Promise<number[]> {
    if (!this.pythonUrl) {
      throw new Error("PYTHON_LLM_URL environment variable is not set");
    }

    const res = await fetch(this.pythonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`
      );
    }

    const data = await res.json();

    if (!data || !data.embedding || !Array.isArray(data.embedding)) {
      throw new Error("Python API returned empty or invalid embeddings");
    }

    return data.embedding;
  }

  async embeddingHF(text: string): Promise<number[]> {
    const inference = new InferenceClient(this.hfToken);

    const response = await inference.featureExtraction({
      model: process.env.HUGGINGFACE_EMBEDDING_MODEL!,
      inputs: text,
    });

    if (!Array.isArray(response) || !Array.isArray(response[0])) {
      throw new Error("HuggingFace API returned invalid embeddings");
    }

    return response as number[];
  }

  async *generateAnswerStream(prompt: string) {
    const inference = new InferenceClient(this.hfToken);

    const stream = await inference.chatCompletionStream({
      model: this.hfChatModel,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  buildPrompt(
    context: string,
    question: string,
    chatHistory: string[]
  ): string {
    // Trim chat history to fit within token limits
    const historyStr = this.trimChatHistory(chatHistory);

    return `
    You are an AI assistant. Answer the question using ONLY the context and chat history below.
    If the context does not contain the answer, respond with "I don't know".

    Chat History:
    ${historyStr}
    Context:
    ${context}

    Question: ${question}
    Answer:
    `.trim();
  }

  private trimChatHistory(chatHistory: string[]): string {
    const MAX_HISTORY_TOKENS = 1000;
    let tokenCount = 0;
    const trimmedHistory: string[] = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const entry = chatHistory[i];
      const entryTokens = Math.ceil(entry.length / 4);
      if (tokenCount + entryTokens > MAX_HISTORY_TOKENS) break;
      trimmedHistory.unshift(entry);
      tokenCount += entryTokens;
    }
    return trimmedHistory.join("\n") + "\n\n";
  }
}
