import { z } from 'zod';

export const LLMRequestSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Prompt is required')
    .max(100000, 'Prompt must not exceed 100,000 characters'),
  config: z
    .object({
      version: z.string().optional(),
      maxLength: z.number().int().positive().max(10000).optional(),
      tone: z
        .enum([
          'formal',
          'casual',
          'professional',
          'academic',
          'conversational',
        ])
        .optional(),
      temperature: z.number().min(0).max(2).optional(),
      truncateStrategy: z
        .enum(['truncate-history', 'truncate-context', 'error'])
        .optional(),
      language: z.string().min(2).max(10).optional(),
      jurisdiction: z.string().min(2).max(10).optional(),
      logStats: z.boolean().optional(),
      truncateBuffer: z.number().int().nonnegative().max(1000).optional(),
    })
    .optional(),
  stream: z.boolean().default(false),
  context: z.string().max(50000).optional(),
  chatHistory: z.array(z.string().max(1000)).max(50).optional(),
});

export const LLMResponseSchema = z.object({
  id: z.string().uuid(),
  model: z.string().min(1),
  created: z.number().int().positive(),
  choices: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      message: z.object({
        role: z.literal('assistant'),
        content: z.string(),
      }),
      finish_reason: z.string(),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
  metadata: z
    .object({
      provider: z.string(),
      model: z.string(),
      latencyMs: z.number().nonnegative(),
      cached: z.boolean(),
      rateLimited: z.boolean(),
      circuitBreakerOpen: z.boolean(),
    })
    .optional(),
});

export const LLMStreamResponseSchema = z.object({
  id: z.string().uuid(),
  model: z.string().min(1),
  created: z.number().int().positive(),
  choices: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      delta: z.object({
        content: z.string().optional(),
        role: z.literal('assistant').optional(),
      }),
      finish_reason: z.string().nullable(),
    }),
  ),
  metadata: z
    .object({
      provider: z.string(),
      model: z.string(),
      latencyMs: z.number().nonnegative(),
      cached: z.boolean(),
      rateLimited: z.boolean(),
      circuitBreakerOpen: z.boolean(),
    })
    .optional(),
});

export const LLMErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  statusCode: z.number().int().positive().max(599).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const LLMMetricsSchema = z.object({
  requestCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  tokenUsage: z.object({
    prompt: z.number().int().nonnegative(),
    completion: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const LLMConfigSchema = z.object({
  provider: z.enum(['huggingface', 'openai', 'anthropic']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  timeoutMs: z.number().int().positive().max(300000), // 5 minutes max
  maxRetries: z.number().int().nonnegative().max(5),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  frequencyPenalty: z.number().min(-2).max(2),
  presencePenalty: z.number().min(-2).max(2),
  maxTokens: z.number().int().positive().max(100000),
  cacheEnabled: z.boolean(),
  cacheTTL: z.number().int().positive().max(86400), // 24 hours max
  rateLimit: z.object({
    requestsPerMinute: z.number().int().positive().max(10000),
    tokensPerMinute: z.number().int().positive().max(1000000),
  }),
  circuitBreaker: z.object({
    enabled: z.boolean(),
    timeout: z.number().int().positive().max(300000),
    errorThresholdPercentage: z.number().min(0).max(100),
    resetTimeout: z.number().int().positive().max(300000),
  }),
});

export const EmbeddingRequestSchema = z.object({
  text: z
    .string()
    .min(1, 'Text is required for embedding')
    .max(100000, 'Text must not exceed 100,000 characters'),
  model: z.string().optional(),
  normalize: z.boolean().default(true),
});

export const EmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

export const PromptValidationSchema = z.object({
  input: z.string().min(1).max(100000),
  maxLength: z.number().int().positive().max(100000).optional(),
  allowedLanguages: z.array(z.string()).optional(),
  allowedJurisdictions: z.array(z.string()).optional(),
  allowedTones: z.array(z.string()).optional(),
});

export const PromptTruncationSchema = z.object({
  originalLength: z.number().int().positive(),
  truncatedLength: z.number().int().positive(),
  strategy: z.enum(['truncate-history', 'truncate-context', 'error']),
  tokensRemoved: z.number().int().nonnegative(),
  processingTimeMs: z.number().nonnegative(),
});

export type LLMRequest = z.infer<typeof LLMRequestSchema>;
export type LLMResponse = z.infer<typeof LLMResponseSchema>;
export type LLMStreamResponse = z.infer<typeof LLMStreamResponseSchema>;
export type LLMError = z.infer<typeof LLMErrorSchema>;
export type LLMMetrics = z.infer<typeof LLMMetricsSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;
export type PromptValidation = z.infer<typeof PromptValidationSchema>;
export type PromptTruncation = z.infer<typeof PromptTruncationSchema>;
