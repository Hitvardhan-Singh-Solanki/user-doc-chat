/**
 * Configuration types for application settings
 */

export type AllowedLanguage = string;
export type AllowedJurisdiction = string;
export type AllowedTone = string;

export interface PromptConfigOptions {
  MAX_INPUT_SIZE: number;
  MAX_SENTENCES: number;
  MAX_HISTORY_LINES: number;
  MAX_TOKEN_OPERATIONS: number;
  TOKEN_WINDOW_MS: number;
  PROMPT_TIMEOUT_MS: number;
  REGEX_TIMEOUT_MS: number;
  PRIORITY_BUFFER: number;
  OVERFLOW_BUFFER: number;
  MAX_SANITIZATION_ITERATIONS: number;
  MAX_REGEX_ITERATIONS: number;
  LARGE_DOCUMENT_THRESHOLD: number;
  TOKEN_CACHE_SIZE: number;
  ALLOWED_LANGUAGES: string[];
  ALLOWED_JURISDICTIONS: string[];
  ALLOWED_TONES: string[];
}

export type PromptConfigParsed = PromptConfigOptions;

export type ConfigAllowedLanguage = string;
export type ConfigAllowedJurisdiction = string;
export type ConfigAllowedTone = string;
