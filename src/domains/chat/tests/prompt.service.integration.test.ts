import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptService } from '../services/prompt.service';
import { ITokenizer } from '@interfaces/tokenizer.interface';
// import { UserInputSchema } from '@auth/validators/user-input.validator';
// import { LowContentSchema } from '@files/validators/file-input.validator';
import { MAX_INPUT_SIZE } from '@config/prompt.config';

// Mock tokenizer with realistic behavior
const mockTokenizer: ITokenizer = {
  countTokens: vi.fn(async (text: string) => Math.ceil(text.length / 4)),
  encode: vi.fn((text: string) => text.split(' ').map((_, i) => i + 1)),
  decode: vi.fn((tokens: number[]) => tokens.map((t) => `token${t}`).join(' ')),
};

describe('PromptService Integration Tests', () => {
  let promptService: PromptService;

  beforeEach(() => {
    vi.clearAllMocks();
    promptService = new PromptService(mockTokenizer);
  });

  describe('Large Legal Document Processing', () => {
    it('should process 10MB legal document', () => {
      const largeDocument = generateLegalDocument(10 * 1024 * 1024); // 10MB

      const result = promptService.sanitizeText(largeDocument);

      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(largeDocument.length); // Should be sanitized
    });

    it('should process 25MB legal document', () => {
      const largeDocument = generateLegalDocument(25 * 1024 * 1024); // 25MB

      const result = promptService.sanitizeText(largeDocument);

      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(largeDocument.length);
    });

    it('should reject 50MB+ document', () => {
      const oversizedDocument = generateLegalDocument(MAX_INPUT_SIZE + 1024);

      expect(() => promptService.sanitizeText(oversizedDocument)).toThrow();
    });
  });

  describe('Documents with Many Clauses', () => {
    it('should handle document with 1000+ clauses', () => {
      const documentWithClauses = generateDocumentWithClauses(1000);

      const result = promptService.sanitizeText(documentWithClauses);

      expect(result).toBeDefined();
    });

    it('should handle document with 5000+ clauses', () => {
      const documentWithClauses = generateDocumentWithClauses(5000);

      const result = promptService.sanitizeText(documentWithClauses);

      expect(result).toBeDefined();
    });
  });

  describe('Long Chat Histories', () => {
    it('should handle chat history with 1000+ messages', () => {
      const longChatHistory = generateChatHistory(1000).join('\n');

      const result = promptService.sanitizeText(longChatHistory);

      expect(result).toBeDefined();
    });

    it('should handle chat history with 5000+ messages', () => {
      const longChatHistory = generateChatHistory(5000).join('\n');

      const result = promptService.sanitizeText(longChatHistory);

      expect(result).toBeDefined();
    });
  });

  describe('Main Prompt Generation', () => {
    it('should generate prompt for large legal document', async () => {
      const largeContext = generateLegalDocument(5 * 1024 * 1024); // 5MB
      const input = {
        context: largeContext,
        question: 'What are the key terms of this agreement?',
        chatHistory: generateChatHistory(100),
      };

      const prompt = await promptService.mainPrompt(input);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should generate prompt with long chat history', async () => {
      const input = {
        context: 'This is a legal agreement between parties.',
        question: 'What does section 1 say?',
        chatHistory: generateChatHistory(100), // Reduced to 100 for reasonable prompt size
      };

      const prompt = await promptService.mainPrompt(input);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('Low Prompt Generation', () => {
    it('should generate low prompt for large content array', async () => {
      const largeContent = Array(1000)
        .fill(0)
        .map(
          (_, i) =>
            `Content ${i}: This is a legal document section with important information.`,
        );

      const prompt = await promptService.lowPrompt(largeContent);

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('Summarization Prompt Generation', () => {
    it('should generate summarization prompt for large text', async () => {
      const largeText = generateLegalDocument(10 * 1024 * 1024); // 10MB

      const prompt = await promptService.createSummarizationPrompt({
        text: largeText,
      });

      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases from Existing Tests', () => {
    it('should handle empty input gracefully', () => {
      expect(() => promptService.sanitizeText('')).not.toThrow();
      expect(promptService.sanitizeText('')).toBe('');
    });

    it('should handle whitespace-only input', () => {
      const whitespaceInput = '   \n\t  \r\n  ';
      const result = promptService.sanitizeText(whitespaceInput);
      expect(result).toBe('');
    });

    it('should handle input with only special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = promptService.sanitizeText(specialChars);
      expect(result).toBe(specialChars);
    });

    it('should handle unicode text', () => {
      const unicodeText = 'Hello 世界 🌍 مرحبا بالعالم';
      const result = promptService.sanitizeText(unicodeText);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Realistic Legal Document Scenarios', () => {
    it('should handle employment contract', () => {
      const employmentContract = generateEmploymentContract();

      const result = promptService.sanitizeText(employmentContract);

      expect(result).toBeDefined();
    });

    it('should handle service agreement', () => {
      const serviceAgreement = generateServiceAgreement();

      const result = promptService.sanitizeText(serviceAgreement);

      expect(result).toBeDefined();
    });

    it('should handle terms of service', () => {
      const termsOfService = generateTermsOfService();

      const result = promptService.sanitizeText(termsOfService);

      expect(result).toBeDefined();
    });
  });
});

// Helper functions to generate test data
function generateLegalDocument(sizeInBytes: number): string {
  const baseText = `
    AGREEMENT
    
    Section 1: Parties
    This agreement is entered into between Party A and Party B.
    
    Section 2: Terms and Conditions
    The following terms and conditions shall apply:
    1. Party A shall provide the services as described
    2. Party B shall make payments as specified
    3. Both parties shall maintain confidentiality
    4. This agreement shall be governed by Indian law
    
    Section 3: Duration
    This agreement shall remain in effect for the duration specified.
    
    Section 4: Termination
    Either party may terminate this agreement with proper notice.
    
    Section 5: Dispute Resolution
    Any disputes shall be resolved through arbitration.
  `;

  const repeatCount = Math.ceil(sizeInBytes / baseText.length);
  return baseText.repeat(repeatCount).substring(0, sizeInBytes);
}

function generateDocumentWithClauses(clauseCount: number): string {
  const clauses = Array(clauseCount)
    .fill(0)
    .map(
      (_, i) =>
        `Section ${i + 1}: This is clause ${i + 1} of the agreement. It contains important legal information and obligations.`,
    );
  return clauses.join('\n\n');
}

function generateChatHistory(messageCount: number): string[] {
  return Array(messageCount)
    .fill(0)
    .map(
      (_, i) =>
        `User: What does section ${i + 1} say?\nAI: Section ${i + 1} states that the terms are as follows...`,
    );
}

function generateEmploymentContract(): string {
  return `
    EMPLOYMENT AGREEMENT
    
    This Employment Agreement is entered into between the Company and the Employee.
    
    Section 1: Position and Duties
    The Employee shall serve as a Software Engineer and perform all duties assigned.
    
    Section 2: Compensation
    The Employee shall receive a salary of ₹10,00,000 per annum.
    
    Section 3: Working Hours
    The Employee shall work 40 hours per week.
    
    Section 4: Confidentiality
    The Employee shall maintain strict confidentiality of company information.
    
    Section 5: Termination
    Either party may terminate this agreement with 30 days notice.
  `;
}

function generateServiceAgreement(): string {
  return `
    SERVICE AGREEMENT
    
    This Service Agreement is between the Service Provider and the Client.
    
    Section 1: Services
    The Service Provider shall provide software development services.
    
    Section 2: Payment Terms
    Payment shall be made within 30 days of invoice receipt.
    
    Section 3: Intellectual Property
    All intellectual property shall remain with the Service Provider.
    
    Section 4: Limitation of Liability
    The Service Provider's liability is limited to the contract value.
  `;
}

function generateTermsOfService(): string {
  return `
    TERMS OF SERVICE
    
    These terms govern the use of our software platform.
    
    Section 1: Acceptance
    By using the platform, you accept these terms.
    
    Section 2: User Responsibilities
    Users must comply with all applicable laws and regulations.
    
    Section 3: Data Privacy
    We collect and process data in accordance with our privacy policy.
    
    Section 4: Modifications
    We may modify these terms at any time with notice.
  `;
}
