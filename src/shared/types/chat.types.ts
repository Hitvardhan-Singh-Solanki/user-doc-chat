/**
 * Chat and prompt-related types and interfaces
 */

export interface PromptConfig {
  version?: string;
  maxLength?: number;
  tone?: string;
  temperature?: number;
  truncateStrategy?: 'truncate-history' | 'truncate-context' | 'error';
  language?: string;
  jurisdiction?: string;
  logStats?: boolean;
  truncateBuffer?: number;
}

export interface PromptServiceConfig {
  CHARS_PER_TOKEN: number;
  tokenCache: Map<string, number>;
  tokenizationCount: number;
  tokenizationWindowStart: number;
}

export interface PromptValidationResult {
  isValid: boolean;
  error?: string;
}

export interface PromptTruncationResult {
  truncatedPrompt: string;
  truncatedSections: string[];
}

export interface PromptStats {
  totalTokens: number;
  contextTokens: number;
  historyTokens: number;
  questionTokens: number;
  headerTokens: number;
}

export interface PromptSection {
  content: string;
  tokens: number;
  priority: number;
}

export interface PromptHeader {
  version: string;
  tone: string;
  language: string;
  jurisdiction: string;
  temperature: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface ChatHistory {
  messages: ChatMessage[];
  maxLength: number;
}

export interface PromptInjectionDetection {
  isInjection: boolean;
  patterns: string[];
  confidence: number;
}

export interface TokenCountResult {
  tokens: number;
  characters: number;
  estimated: boolean;
}

export interface PromptSanitizationResult {
  sanitizedText: string;
  removedPatterns: string[];
  originalLength: number;
  sanitizedLength: number;
}

export interface PromptTruncationOptions {
  maxTokens: number;
  strategy: 'truncate-history' | 'truncate-context' | 'error';
  buffer: number;
}

export interface PromptContext {
  question: string;
  context: string;
  chatHistory: string[];
  fileId?: string;
  userId?: string;
}

export interface PromptResponse {
  content: string;
  tokens: number;
  processingTime: number;
  config: PromptConfig;
}

export type PromptTruncationStrategy =
  | 'truncate-history'
  | 'truncate-context'
  | 'error';
export type ChatRole = 'user' | 'assistant' | 'system';
export type PromptTone = 'formal' | 'casual' | 'professional';
