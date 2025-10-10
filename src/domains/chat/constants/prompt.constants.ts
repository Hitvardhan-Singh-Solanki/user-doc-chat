/**
 * Constants for PromptService resource limits and configuration
 * These limits are designed for MVP with 10 DAU and 50MB max file size
 */

// Resource Limits
export const MAX_INPUT_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_SENTENCES = 10000;
export const MAX_HISTORY_LINES = 1000;
export const MAX_TOKEN_OPERATIONS = 100;
export const PROMPT_TIMEOUT_MS = 5000;
export const REGEX_TIMEOUT_MS = 500;

// Buffer and Overflow Limits
export const PRIORITY_BUFFER = 50;
export const OVERFLOW_BUFFER = 100;

// Security Limits
export const MAX_SANITIZATION_ITERATIONS = 10;
export const MAX_REGEX_ITERATIONS = 1000;

// Performance Thresholds
export const LARGE_DOCUMENT_THRESHOLD = 1024 * 1024; // 1MB
export const TOKEN_CACHE_SIZE = 1000;

// Validation Patterns - Only flag when they appear in suspicious contexts
export const SUSPICIOUS_PATTERNS = [
  /^SYSTEM\s+INSTRUCTION\s*:/gi,
  /CONTEXT\s*===/gi,
  /ANSWER\s*===/gi,
  /^ROLE\s*:/gi,
  /^CONSTRAINTS\s*:/gi,
  /IGNORE\s+PREVIOUS/gi,
  /DISREGARD\s+EARLIER/gi,
  /FORGET\s+CONTEXT/gi,
  /RESET\s+SYSTEM/gi,
  /NEW\s+INSTRUCTIONS/gi,
];

// Allowed Values
export const ALLOWED_LANGUAGES = ['english'] as const;
export const ALLOWED_JURISDICTIONS = ['INDIA'] as const;
export const ALLOWED_TONES = ['formal', 'casual', 'professional'] as const;

export type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];
export type AllowedJurisdiction = (typeof ALLOWED_JURISDICTIONS)[number];
export type AllowedTone = (typeof ALLOWED_TONES)[number];
