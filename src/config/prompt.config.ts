import { z } from 'zod';
import type { AllowedLanguage, AllowedJurisdiction, AllowedTone } from '@shared/types';

const parseEnvInt = (envVar: string | undefined): number | undefined => {
  if (!envVar) return undefined;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? undefined : parsed;
};

const promptConfigSchema = z.object({
  MAX_INPUT_SIZE: z.number().default(50 * 1024 * 1024), // 50MB
  MAX_SENTENCES: z.number().default(10000),
  MAX_HISTORY_LINES: z.number().default(1000),
  MAX_TOKEN_OPERATIONS: z.number().default(100),
  TOKEN_WINDOW_MS: z.number().default(5 * 60 * 1000), // 5 minutes
  PROMPT_TIMEOUT_MS: z.number().default(5000),
  REGEX_TIMEOUT_MS: z.number().default(500),
  PRIORITY_BUFFER: z.number().default(50),
  OVERFLOW_BUFFER: z.number().default(100),
  MAX_SANITIZATION_ITERATIONS: z.number().default(10),
  MAX_REGEX_ITERATIONS: z.number().default(1000),
  LARGE_DOCUMENT_THRESHOLD: z.number().default(1024 * 1024), // 1MB
  TOKEN_CACHE_SIZE: z.number().default(1000),
  ALLOWED_LANGUAGES: z.array(z.string()).default(['english']),
  ALLOWED_JURISDICTIONS: z.array(z.string()).default(['india']),
  ALLOWED_TONES: z
    .array(z.string())
    .default(['formal', 'casual', 'professional']),
});

export type PromptConfigParsed = z.infer<typeof promptConfigSchema>;

export const promptConfig: PromptConfigParsed = promptConfigSchema.parse({
  MAX_INPUT_SIZE:
    parseEnvInt(process.env.PROMPT_MAX_INPUT_SIZE) ?? 50 * 1024 * 1024,
  MAX_SENTENCES: parseEnvInt(process.env.PROMPT_MAX_SENTENCES) ?? 10000,
  MAX_HISTORY_LINES: parseEnvInt(process.env.PROMPT_MAX_HISTORY_LINES) ?? 1000,
  MAX_TOKEN_OPERATIONS:
    parseEnvInt(process.env.PROMPT_MAX_TOKEN_OPERATIONS) ?? 100,
  TOKEN_WINDOW_MS:
    parseEnvInt(process.env.PROMPT_TOKEN_WINDOW_MS) ?? 5 * 60 * 1000,
  PROMPT_TIMEOUT_MS: parseEnvInt(process.env.PROMPT_TIMEOUT_MS) ?? 5000,
  REGEX_TIMEOUT_MS: parseEnvInt(process.env.PROMPT_REGEX_TIMEOUT_MS) ?? 500,
  PRIORITY_BUFFER: parseEnvInt(process.env.PROMPT_PRIORITY_BUFFER) ?? 50,
  OVERFLOW_BUFFER: parseEnvInt(process.env.PROMPT_OVERFLOW_BUFFER) ?? 100,
  MAX_SANITIZATION_ITERATIONS:
    parseEnvInt(process.env.PROMPT_MAX_SANITIZATION_ITERATIONS) ?? 10,
  MAX_REGEX_ITERATIONS:
    parseEnvInt(process.env.PROMPT_MAX_REGEX_ITERATIONS) ?? 1000,
  LARGE_DOCUMENT_THRESHOLD:
    parseEnvInt(process.env.PROMPT_LARGE_DOCUMENT_THRESHOLD) ?? 1024 * 1024,
  TOKEN_CACHE_SIZE: parseEnvInt(process.env.PROMPT_TOKEN_CACHE_SIZE) ?? 1000,
  ALLOWED_LANGUAGES: process.env.PROMPT_ALLOWED_LANGUAGES
    ? process.env.PROMPT_ALLOWED_LANGUAGES.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((lang) => lang.toLowerCase())
    : ['english'],
  ALLOWED_JURISDICTIONS: process.env.PROMPT_ALLOWED_JURISDICTIONS
    ? process.env.PROMPT_ALLOWED_JURISDICTIONS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((jurisdiction) => jurisdiction.toLowerCase())
    : ['india'],
  ALLOWED_TONES: process.env.PROMPT_ALLOWED_TONES
    ? process.env.PROMPT_ALLOWED_TONES.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['formal', 'casual', 'professional'],
});

export const {
  MAX_INPUT_SIZE,
  MAX_SENTENCES,
  MAX_HISTORY_LINES,
  MAX_TOKEN_OPERATIONS,
  TOKEN_WINDOW_MS,
  PROMPT_TIMEOUT_MS,
  REGEX_TIMEOUT_MS,
  PRIORITY_BUFFER,
  OVERFLOW_BUFFER,
  MAX_SANITIZATION_ITERATIONS,
  MAX_REGEX_ITERATIONS,
  LARGE_DOCUMENT_THRESHOLD,
  TOKEN_CACHE_SIZE,
  ALLOWED_LANGUAGES,
  ALLOWED_JURISDICTIONS,
  ALLOWED_TONES,
} = promptConfig;

// Export type-safe versions of the allowed values
export type ConfigAllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];
export type ConfigAllowedJurisdiction = (typeof ALLOWED_JURISDICTIONS)[number];
export type ConfigAllowedTone = (typeof ALLOWED_TONES)[number];

export const SUSPICIOUS_PATTERNS = [
  /^SYSTEM\s+INSTRUCTION\s*:/gim,
  /CONTEXT\s*===/gi,
  /ANSWER\s*===/gi,
  /^ROLE\s*:/gim,
  /^CONSTRAINTS\s*:/gim,
  /IGNORE\s+PREVIOUS/gi,
  /DISREGARD\s+EARLIER/gi,
  /FORGET\s+CONTEXT/gi,
  /RESET\s+SYSTEM/gi,
  /NEW\s+INSTRUCTIONS/gi,
];
