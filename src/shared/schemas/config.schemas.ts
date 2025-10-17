import { z } from 'zod';

const booleanPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.toLowerCase() === 'true';
  }
  return val;
};

export const PromptConfigSchema = z.object({
  MAX_INPUT_SIZE: z
    .number()
    .int()
    .positive('MAX_INPUT_SIZE must be positive')
    .default(50 * 1024 * 1024), // 50MB
  MAX_SENTENCES: z
    .number()
    .int()
    .positive('MAX_SENTENCES must be positive')
    .max(100000, 'MAX_SENTENCES must not exceed 100,000')
    .default(10000),
  MAX_HISTORY_LINES: z
    .number()
    .int()
    .positive('MAX_HISTORY_LINES must be positive')
    .max(10000, 'MAX_HISTORY_LINES must not exceed 10,000')
    .default(1000),
  MAX_TOKEN_OPERATIONS: z
    .number()
    .int()
    .positive('MAX_TOKEN_OPERATIONS must be positive')
    .max(1000, 'MAX_TOKEN_OPERATIONS must not exceed 1,000')
    .default(100),
  TOKEN_WINDOW_MS: z
    .number()
    .int()
    .positive('TOKEN_WINDOW_MS must be positive')
    .max(60 * 60 * 1000, 'TOKEN_WINDOW_MS must not exceed 1 hour')
    .default(5 * 60 * 1000), // 5 minutes
  PROMPT_TIMEOUT_MS: z
    .number()
    .int()
    .positive('PROMPT_TIMEOUT_MS must be positive')
    .max(30000, 'PROMPT_TIMEOUT_MS must not exceed 30 seconds')
    .default(5000),
  REGEX_TIMEOUT_MS: z
    .number()
    .int()
    .positive('REGEX_TIMEOUT_MS must be positive')
    .max(5000, 'REGEX_TIMEOUT_MS must not exceed 5 seconds')
    .default(500),
  PRIORITY_BUFFER: z
    .number()
    .int()
    .nonnegative('PRIORITY_BUFFER must be non-negative')
    .max(1000, 'PRIORITY_BUFFER must not exceed 1,000')
    .default(50),
  OVERFLOW_BUFFER: z
    .number()
    .int()
    .nonnegative('OVERFLOW_BUFFER must be non-negative')
    .max(1000, 'OVERFLOW_BUFFER must not exceed 1,000')
    .default(100),
  MAX_SANITIZATION_ITERATIONS: z
    .number()
    .int()
    .positive('MAX_SANITIZATION_ITERATIONS must be positive')
    .max(100, 'MAX_SANITIZATION_ITERATIONS must not exceed 100')
    .default(10),
  MAX_REGEX_ITERATIONS: z
    .number()
    .int()
    .positive('MAX_REGEX_ITERATIONS must be positive')
    .max(10000, 'MAX_REGEX_ITERATIONS must not exceed 10,000')
    .default(1000),
  LARGE_DOCUMENT_THRESHOLD: z
    .number()
    .int()
    .positive('LARGE_DOCUMENT_THRESHOLD must be positive')
    .max(100 * 1024 * 1024, 'LARGE_DOCUMENT_THRESHOLD must not exceed 100MB')
    .default(1024 * 1024), // 1MB
  TOKEN_CACHE_SIZE: z
    .number()
    .int()
    .positive('TOKEN_CACHE_SIZE must be positive')
    .max(10000, 'TOKEN_CACHE_SIZE must not exceed 10,000')
    .default(1000),
  ALLOWED_LANGUAGES: z
    .array(z.string().min(2, 'Language code must be at least 2 characters'))
    .min(1, 'At least one language must be allowed')
    .max(50, 'Maximum 50 languages allowed')
    .default(['english']),
  ALLOWED_JURISDICTIONS: z
    .array(z.string().min(2, 'Jurisdiction code must be at least 2 characters'))
    .min(1, 'At least one jurisdiction must be allowed')
    .max(50, 'Maximum 50 jurisdictions allowed')
    .default(['india']),
  ALLOWED_TONES: z
    .array(
      z.enum([
        'formal',
        'casual',
        'professional',
        'academic',
        'conversational',
      ]),
    )
    .min(1, 'At least one tone must be allowed')
    .max(10, 'Maximum 10 tones allowed')
    .default(['formal', 'casual', 'professional']),
});

export const AppConfigSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce
    .number()
    .int()
    .positive('PORT must be a positive integer')
    .max(65535, 'PORT must not exceed 65535')
    .default(3000),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').optional(),

  // Database
  POSTGRES_HOST: z
    .string()
    .min(1, 'POSTGRES_HOST is required')
    .default('localhost'),
  POSTGRES_PORT: z.coerce
    .number()
    .int()
    .positive('POSTGRES_PORT must be positive')
    .max(65535, 'POSTGRES_PORT must not exceed 65535')
    .default(5432),
  POSTGRES_DB: z
    .string()
    .min(1, 'POSTGRES_DB is required')
    .default('user_doc_chat'),
  POSTGRES_USER: z
    .string()
    .min(1, 'POSTGRES_USER is required')
    .default('postgres'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  POSTGRES_VECTOR_DISTANCE_OPERATOR: z
    .enum(['cosine', 'euclidean', 'inner_product'])
    .default('cosine'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').optional(),
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required').default('localhost'),
  REDIS_PORT: z.coerce
    .number()
    .int()
    .positive('REDIS_PORT must be positive')
    .max(65535, 'REDIS_PORT must not exceed 65535')
    .default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: z.preprocess(booleanPreprocess, z.coerce.boolean()).default(false),
  REDIS_DB: z.coerce
    .number()
    .int()
    .nonnegative('REDIS_DB must be non-negative')
    .max(15, 'REDIS_DB must not exceed 15')
    .default(0),
  REDIS_SOCKET: z.string().optional(),

  // JWT
  JWT_EXPIRES_IN: z
    .string()
    .regex(
      /^\d+[smhd]$/,
      'JWT_EXPIRES_IN must be in format like 7d, 24h, 60m, 3600s',
    )
    .default('7d'),
  JWT_AUDIENCE: z.string().min(1, 'JWT_AUDIENCE is required for security'),
  JWT_ISSUER: z.string().min(1, 'JWT_ISSUER is required for security'),

  // Security
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive('RATE_LIMIT_WINDOW_MS must be positive')
    .max(60 * 60 * 1000, 'RATE_LIMIT_WINDOW_MS must not exceed 1 hour')
    .default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive('RATE_LIMIT_MAX_REQUESTS must be positive')
    .max(10000, 'RATE_LIMIT_MAX_REQUESTS must not exceed 10,000')
    .default(100),

  // AI/ML
  HUGGINGFACE_HUB_TOKEN: z.string().min(1, 'HUGGINGFACE_HUB_TOKEN is required'),

  // Vector Store
  PINECONE_INDEX: z
    .string()
    .min(1, 'PINECONE_INDEX is required')
    .default('user-doc-chat'),
  PINECONE_TOP_K: z.coerce
    .number()
    .int()
    .positive('PINECONE_TOP_K must be positive')
    .max(100, 'PINECONE_TOP_K must not exceed 100')
    .default(5),
  PINECONE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive('PINECONE_BATCH_SIZE must be positive')
    .max(1000, 'PINECONE_BATCH_SIZE must not exceed 1,000')
    .default(100),
  PINECONE_API_KEY: z.string().min(1, 'PINECONE_API_KEY is required'),
  VECTOR_STORE_PROVIDER: z.enum(['pinecone', 'pgvector']).default('pinecone'),

  // Processing
  MAX_CONTEXT_TOKENS: z.coerce
    .number()
    .int()
    .positive('MAX_CONTEXT_TOKENS must be positive')
    .max(100000, 'MAX_CONTEXT_TOKENS must not exceed 100,000')
    .default(4000),
  CHUNK_SIZE: z.coerce
    .number()
    .int()
    .positive('CHUNK_SIZE must be positive')
    .max(10000, 'CHUNK_SIZE must not exceed 10,000')
    .default(1000),
  CHUNK_OVERLAP: z.coerce
    .number()
    .int()
    .nonnegative('CHUNK_OVERLAP must be non-negative')
    .max(1000, 'CHUNK_OVERLAP must not exceed 1,000')
    .default(200),

  // Crawler
  CRAWLER_USER_AGENT: z
    .string()
    .min(1, 'CRAWLER_USER_AGENT is required')
    .max(255, 'CRAWLER_USER_AGENT must not exceed 255 characters')
    .default('user-doc-chat/1.0 (+enrichment)'),
  CRAWLER_MAX_REDIRECTS: z.coerce
    .number()
    .int()
    .nonnegative('CRAWLER_MAX_REDIRECTS must be non-negative')
    .max(10, 'CRAWLER_MAX_REDIRECTS must not exceed 10')
    .default(5),
  CRAWLER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive('CRAWLER_TIMEOUT_MS must be positive')
    .max(60000, 'CRAWLER_TIMEOUT_MS must not exceed 60 seconds')
    .default(10000),

  // Storage
  MINIO_ENDPOINT: z
    .string()
    .min(1, 'MINIO_ENDPOINT is required')
    .default('localhost'),
  MINIO_PORT: z.coerce
    .number()
    .int()
    .positive('MINIO_PORT must be positive')
    .max(65535, 'MINIO_PORT must not exceed 65535')
    .default(9000),
  MINIO_USE_SSL: z
    .preprocess(booleanPreprocess, z.coerce.boolean())
    .default(false),
  MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  MINIO_BUCKET_NAME: z
    .string()
    .min(1, 'MINIO_BUCKET_NAME is required')
    .default('user-doc-chat'),
  MINIO_DEFAULT_BUCKET: z
    .string()
    .min(1, 'MINIO_DEFAULT_BUCKET is required')
    .default('user-files'),

  // Python HTTP Service
  PYTHON_LLM_URL: z
    .string()
    .url('PYTHON_LLM_URL must be a valid URL')
    .default('http://localhost:8000/embed'),

  // Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Additional missing properties
  MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive('MAX_FILE_SIZE must be positive')
    .max(100 * 1024 * 1024, 'MAX_FILE_SIZE must not exceed 100MB')
    .default(10 * 1024 * 1024), // 10MB
  MAX_FILE_UPLOAD_SIZE: z.coerce
    .number()
    .int()
    .positive('MAX_FILE_UPLOAD_SIZE must be positive')
    .max(100 * 1024 * 1024, 'MAX_FILE_UPLOAD_SIZE must not exceed 100MB')
    .default(10 * 1024 * 1024), // 10MB
  CRAWLER_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive('CRAWLER_MAX_BYTES must be positive')
    .max(50 * 1024 * 1024, 'CRAWLER_MAX_BYTES must not exceed 50MB')
    .default(5 * 1024 * 1024), // 5MB
  CORS_ORIGINS: z.string().optional(),
  SALT_ROUNDS: z.coerce
    .number()
    .int()
    .positive('SALT_ROUNDS must be positive')
    .max(20, 'SALT_ROUNDS must not exceed 20')
    .default(12),
  JWT_MAX_AGE: z.coerce
    .number()
    .int()
    .positive('JWT_MAX_AGE must be positive')
    .max(365 * 24 * 60 * 60, 'JWT_MAX_AGE must not exceed 1 year')
    .default(7 * 24 * 60 * 60), // 7 days
  PINECONE_MAX_RETRIES: z.coerce
    .number()
    .int()
    .nonnegative('PINECONE_MAX_RETRIES must be non-negative')
    .max(10, 'PINECONE_MAX_RETRIES must not exceed 10')
    .default(3),
  HUGGINGFACE_CHAT_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_CHAT_MODEL is required')
    .default('microsoft/DialoGPT-medium'),
  HUGGINGFACE_EMBEDDING_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_EMBEDDING_MODEL is required')
    .default('sentence-transformers/all-MiniLM-L6-v2'),
  HUGGINGFACE_SUMMARY_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_SUMMARY_MODEL is required')
    .default('facebook/bart-large-cnn'),
  HUGGINGFACE_TOKENIZER_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_TOKENIZER_MODEL is required')
    .default('gpt2'),
  DEFAULT_TEXT_GENERATION_MODEL: z
    .string()
    .min(1, 'DEFAULT_TEXT_GENERATION_MODEL is required')
    .default('microsoft/DialoGPT-medium'),
  DEFAULT_EMBEDDING_MODEL: z
    .string()
    .min(1, 'DEFAULT_EMBEDDING_MODEL is required')
    .default('sentence-transformers/all-MiniLM-L6-v2'),
  USE_XENOVA_TOKENIZER: z
    .preprocess(booleanPreprocess, z.coerce.boolean())
    .default(false),
  XENOVA_TOKENIZER_MODEL: z
    .string()
    .min(1, 'XENOVA_TOKENIZER_MODEL is required')
    .default('gpt2'),
  LLM_TEXT_GENERATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive('LLM_TEXT_GENERATION_TIMEOUT_MS must be positive')
    .max(120000, 'LLM_TEXT_GENERATION_TIMEOUT_MS must not exceed 2 minutes')
    .default(30000),
  LLM_EMBEDDING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive('LLM_EMBEDDING_TIMEOUT_MS must be positive')
    .max(120000, 'LLM_EMBEDDING_TIMEOUT_MS must not exceed 2 minutes')
    .default(30000),
  LLM_STREAM_GENERATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive('LLM_STREAM_GENERATION_TIMEOUT_MS must be positive')
    .max(300000, 'LLM_STREAM_GENERATION_TIMEOUT_MS must not exceed 5 minutes')
    .default(60000),
  RATE_LIMIT_POINTS: z.coerce
    .number()
    .int()
    .positive('RATE_LIMIT_POINTS must be positive')
    .max(10000, 'RATE_LIMIT_POINTS must not exceed 10,000')
    .default(100),
  RATE_LIMIT_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .positive('RATE_LIMIT_DURATION_SECONDS must be positive')
    .max(3600, 'RATE_LIMIT_DURATION_SECONDS must not exceed 1 hour')
    .default(900), // 15 minutes
  RATE_LIMIT_BLOCK_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .positive('RATE_LIMIT_BLOCK_DURATION_SECONDS must be positive')
    .max(3600, 'RATE_LIMIT_BLOCK_DURATION_SECONDS must not exceed 1 hour')
    .default(60), // 1 minute
});

export type PromptConfig = z.infer<typeof PromptConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
