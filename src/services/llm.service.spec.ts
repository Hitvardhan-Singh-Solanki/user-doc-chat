// src/services/llm.service.spec.ts
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";

// --- Mutable controllers used by vi.mock factories (must be declared before vi.mock) ---
// Make sanitizeText a spy from the start so module under test gets a spy reference.
const PROMPT = {
  mainPrompt: (userInput: any, _cfg?: any) =>
    `MAIN_PROMPT:${JSON.stringify(userInput)}`,
  lowPrompt: (lowContent: string[]) => `LOW_PROMPT:${lowContent.join("|")}`,
  UserInputSchema: { parse: (x: any) => x },
  LowContentSchema: { parse: (x: any) => x },
  sanitizeText: vi.fn((s: string) => (typeof s === "string" ? s.trim() : s)),
};

const HF = {
  featureExtraction: async (..._args: any[]) => [],
  chatCompletionStream: async (..._args: any[]) => {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: true, value: undefined }),
        };
      },
    };
  },
};

// helper to create async iterables from arrays
function asyncIterableFromArray(items: any[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i >= items.length) return { done: true, value: undefined };
          const v = items[i++];
          return { done: false, value: v };
        },
      };
    },
  };
}

// --- Hoisted mocks (safe because PROMPT & HF exist above) ---
vi.mock("@huggingface/inference", () => {
  return {
    InferenceClient: function (_token: string) {
      return {
        featureExtraction: HF.featureExtraction,
        chatCompletionStream: HF.chatCompletionStream,
      };
    },
  };
});

vi.mock("../utils/prompt", () => {
  return {
    mainPrompt: PROMPT.mainPrompt,
    lowPrompt: PROMPT.lowPrompt,
    UserInputSchema: PROMPT.UserInputSchema,
    LowContentSchema: PROMPT.LowContentSchema,
    sanitizeText: PROMPT.sanitizeText,
  };
});

// Delay importing the module under test until after vi.mock runs
let LLMService: any;

describe("LLMService (unit)", () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    const mod = await import("./llm.service");
    LLMService = mod.LLMService;
  });

  beforeEach(() => {
    // reset controller implementations to fresh spies per test
    HF.featureExtraction = vi.fn();
    HF.chatCompletionStream = vi.fn();

    // keep sanitizeText as a spy (reset calls)
    PROMPT.sanitizeText.mockClear();
    PROMPT.mainPrompt = vi.fn(PROMPT.mainPrompt);
    PROMPT.lowPrompt = vi.fn(PROMPT.lowPrompt);

    // mock global fetch; tests change its implementation as needed
    (globalThis as any).fetch = vi.fn();
  });

  afterEach(() => {
    // restore fetch
    (globalThis as any).fetch = originalFetch;
    vi.resetAllMocks();
  });

  it("chunkText splits text with overlap correctly", () => {
    const svc = new LLMService();
    const text = "abcdefghijklmnopqrstuvwxyz"; // 26 chars
    const chunks = svc.chunkText(text, 10, 3); // size 10, overlap 3 => step 7
    expect(chunks[0]).toBe(text.slice(0, 10));
    expect(chunks[1]).toBe(text.slice(7, 17));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("chunkText returns single chunk when shorter than chunkSize", () => {
    const svc = new LLMService();
    const short = "short";
    const chunks = svc.chunkText(short, 50, 10);
    expect(chunks).toEqual([short]);
  });

  it("embeddingPython throws when PYTHON_LLM_URL not set", async () => {
    delete process.env.PYTHON_LLM_URL;
    const svc = new LLMService();
    await expect(svc.embeddingPython("hello")).rejects.toThrow(
      "PYTHON_LLM_URL environment variable is not set"
    );
  });

  it("embeddingPython calls fetch and returns embedding on success (and uses sanitizeText)", async () => {
    process.env.PYTHON_LLM_URL = "http://example.local/embed";
    const svc = new LLMService();
    const fakeEmbedding = [0.1, 0.2, 0.3];

    // mock successful fetch
    (globalThis as any).fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const emb = await svc.embeddingPython(" some text ");
    // sanitizeText is a spy from the top-level PROMPT object
    expect(PROMPT.sanitizeText).toHaveBeenCalled();
    expect(emb).toEqual(fakeEmbedding);
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      process.env.PYTHON_LLM_URL,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("embeddingPython throws when fetch returns non-ok", async () => {
    process.env.PYTHON_LLM_URL = "http://example.local/embed";
    const svc = new LLMService();

    (globalThis as any).fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "ERR",
      text: async () => "internal error",
    });

    await expect(svc.embeddingPython("x")).rejects.toThrow(
      /Python embed API request failed/
    );
  });

  it("embeddingHF handles flat and nested array replies", async () => {
    process.env.HUGGINGFACE_HUB_TOKEN = "token";
    process.env.HUGGINGFACE_EMBEDDING_MODEL = "embed-model";
    const svc = new LLMService();

    // flat array
    (HF.featureExtraction as any).mockResolvedValue([1, 2, 3]);
    const emb1 = await svc.embeddingHF("text");
    expect(emb1).toEqual([1, 2, 3]);

    // nested array
    (HF.featureExtraction as any).mockResolvedValue([[4, 5, 6]]);
    const emb2 = await svc.embeddingHF("text2");
    expect(emb2).toEqual([4, 5, 6]);

    // invalid shape
    (HF.featureExtraction as any).mockResolvedValue([["no", "nums"]]);
    await expect(svc.embeddingHF("bad")).rejects.toThrow();
  });

  it("generateAnswerStream yields tokens and calls enrichment (which may no-op)", async () => {
    process.env.HUGGINGFACE_HUB_TOKEN = "token";
    process.env.HUGGINGFACE_CHAT_MODEL = "chat-model";
    const svc = new LLMService();

    // initial stream yields two chunks
    const chunks = [
      { choices: [{ delta: { content: "Hello " } }] },
      { choices: [{ delta: { content: "world." } }] },
    ];
    (HF.chatCompletionStream as any).mockResolvedValue(
      asyncIterableFromArray(chunks)
    );

    // create a fake enrichment service and attach (it will be called but return null / undefined)
    const fakeEnr = { enrichIfUnknown: vi.fn(async () => null) };
    svc.setEnrichmentService(fakeEnr as any);

    const userInput = { question: "Q1", context: "ctx", chatHistory: [] };
    const got: string[] = [];
    for await (const t of svc.generateAnswerStream(userInput as any)) {
      got.push(t);
    }

    expect(got.join("")).toBe("Hello world.");
    // LLMService calls enrichIfUnknown after first stream; it may no-op (return null)
    expect(fakeEnr.enrichIfUnknown).toHaveBeenCalledTimes(1);
    expect(fakeEnr.enrichIfUnknown).toHaveBeenCalledWith("Q1", "Hello world.");
    expect(HF.chatCompletionStream).toHaveBeenCalled();
  });

  it('generateAnswerStream triggers enrichment on "I don\'t know" and yields enriched tokens', async () => {
    process.env.HUGGINGFACE_HUB_TOKEN = "token";
    process.env.HUGGINGFACE_CHAT_MODEL = "chat-model";
    const svc = new LLMService();

    const initial = [{ choices: [{ delta: { content: "I don't know" } }] }];
    const enriched = [
      { choices: [{ delta: { content: "Enriched answer." } }] },
    ];

    // Make chatCompletionStream return different iterables per call
    let calls = 0;
    (HF.chatCompletionStream as any).mockImplementation(async () => {
      calls++;
      if (calls === 1) return asyncIterableFromArray(initial);
      return asyncIterableFromArray(enriched);
    });

    const fakeResults: any[] = [{ title: "T", snippet: "S", url: "http://u" }];
    const fakeEnr = {
      enrichIfUnknown: vi.fn(async (_q: string, _a: string) => {
        return fakeResults;
      }),
    };
    svc.setEnrichmentService(fakeEnr as any);

    const userInput = { question: "What is X?", context: "", chatHistory: [] };
    const tokens: string[] = [];
    for await (const t of svc.generateAnswerStream(userInput as any)) {
      tokens.push(t);
    }

    const joined = tokens.join("");
    expect(joined).toContain("I don't know");
    expect(joined).toContain("Enriched answer.");
    expect(fakeEnr.enrichIfUnknown).toHaveBeenCalled();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("generateAnswerStream swallows enrichment errors and continues", async () => {
    process.env.HUGGINGFACE_HUB_TOKEN = "token";
    process.env.HUGGINGFACE_CHAT_MODEL = "chat-model";
    const svc = new LLMService();

    const initial = [{ choices: [{ delta: { content: "I don't know" } }] }];
    (HF.chatCompletionStream as any).mockResolvedValue(
      asyncIterableFromArray(initial)
    );

    const throwingEnr = {
      enrichIfUnknown: vi.fn(async () => {
        throw new Error("search error");
      }),
    };
    svc.setEnrichmentService(throwingEnr as any);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const userInput = { question: "Q", context: "", chatHistory: [] };
    const tokens: string[] = [];
    for await (const t of svc.generateAnswerStream(userInput as any)) {
      tokens.push(t);
    }

    expect(tokens.join("")).toContain("I don't know");
    expect(throwingEnr.enrichIfUnknown).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("buildPrompt and buildLowPrompt call underlying prompt utilities", () => {
    const svc = new LLMService();
    const p = svc.buildPrompt("ctx", "q", []);
    const lp = svc.buildLowPrompt(["a", "b"]);
    expect(typeof p).toBe("string");
    expect(typeof lp).toBe("string");
  });
});
