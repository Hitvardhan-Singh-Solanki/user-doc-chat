import { describe, it, expect, vi, beforeEach } from "vitest";
import { PromptService } from "./prompt.service";
import { PromptConfig } from "../types";

describe("PromptService", () => {
  let service: PromptService;

  beforeEach(() => {
    service = new PromptService();
    // @ts-ignore - private access hack for test
    service.logger.debug = vi.fn();
  });

  describe("sanitizeText", () => {
    it("should normalize and clean input text", () => {
      const input = "Hello\u200B World ’Test‘ “Quote”\t\r";
      const result = service.sanitizeText(input);
      expect(result).toBe("Hello World 'Test' \"Quote\"");
    });
  });

  describe("mainPrompt", () => {
    it("should generate a valid prompt", () => {
      const input = {
        question: "What is Section 420 IPC?",
        context:
          "Section 420: Cheating and dishonestly inducing delivery of property.",
        chatHistory: ["Previous Q&A"],
      };

      const result = service.mainPrompt(input);
      expect(result).toContain("=== USER QUESTION ===");
      expect(result).toContain("Section 420");
      expect(result).toContain("=== ANSWER ===");
    });

    it("should throw error for non-English language", () => {
      const input = {
        question: "What is Section 420 IPC?",
        context: "Context",
        chatHistory: [],
      };

      const config: PromptConfig = { language: "es" };

      expect(() => service.mainPrompt(input, config)).toThrow(
        "Only English language is supported"
      );
    });

    it.skip("should truncate content if too long", () => {
      const input = {
        question: "Q",
        context: "C".repeat(12000),
        chatHistory: [],
      };

      const config: PromptConfig = {
        maxLength: 1000,
        truncateStrategy: "truncate-context",
      };

      const result = service.mainPrompt(input, config);
      expect(result).toContain("...[truncated]");
    });
  });

  describe("lowPrompt", () => {
    it("should generate a summary prompt", () => {
      const input = ["This is some legal text", "More clauses"];
      const result = service.lowPrompt(input);
      expect(result).toContain("=== CONTENT TO SUMMARIZE ===");
      expect(result).toContain("This is some legal text");
      expect(result).toContain("=== SUMMARY ===");
    });

    it("should return (No content provided) if input is empty", () => {
      const result = service.lowPrompt([]);
      expect(result).toContain("(No content provided)");
    });
  });
});
