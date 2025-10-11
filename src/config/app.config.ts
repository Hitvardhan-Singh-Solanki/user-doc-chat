import { z } from 'zod';
import { logger } from './logger.config';

const booleanPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.toLowerCase() === 'true';
  }
  return val;
};

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().url().optional(),

  // Database
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('user_doc_chat'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  POSTGRES_VECTOR_DISTANCE_OPERATOR: z.string().default('cosine'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: z.preprocess(booleanPreprocess, z.coerce.boolean()).default(false),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_SOCKET: z.string().optional(),

  // JWT
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_AUDIENCE: z.string().min(1, 'JWT_AUDIENCE is required for security'),
  JWT_ISSUER: z.string().min(1, 'JWT_ISSUER is required for security'),

  // Security
  SALT_ROUNDS: z.coerce.number().default(10),
  JWT_MAX_AGE: z.coerce.number().default(86400), // 24 hours

  // AI/LLM
  HUGGINGFACE_CHAT_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_CHAT_MODEL is required'),
  HUGGINGFACE_TOKENIZER_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_TOKENIZER_MODEL is required'),
  HUGGINGFACE_EMBEDDING_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_EMBEDDING_MODEL is required'),
  HUGGINGFACE_SUMMARY_MODEL: z
    .string()
    .min(1, 'HUGGINGFACE_SUMMARY_MODEL is required'),
  HUGGINGFACE_HUB_TOKEN: z.string().min(1, 'HUGGINGFACE_HUB_TOKEN is required'),

  // Vector Store
  PINECONE_INDEX: z.string().default('user-doc-chat'),
  PINECONE_TOP_K: z.coerce.number().default(5),
  PINECONE_BATCH_SIZE: z.coerce.number().default(100),
  PINECONE_MAX_RETRIES: z.coerce.number().default(3),
  PINECONE_API_KEY: z.string().min(1, 'PINECONE_API_KEY is required'),
  VECTOR_STORE_PROVIDER: z.enum(['pinecone', 'pgvector']).default('pinecone'),

  // Processing
  CHUNK_SIZE: z.coerce.number().default(800),
  CHUNK_OVERLAP: z.coerce.number().default(100),
  MAX_CONTEXT_TOKENS: z.coerce.number().default(2000),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // File Upload
  MAX_FILE_SIZE: z.coerce.number().default(52428800), // 50MB

  // Crawler/HTML Fetch
  CRAWLER_MAX_BYTES: z.coerce.number().default(2_000_000), // 2MB
  CRAWLER_USER_AGENT: z.string().default('user-doc-chat/1.0 (+enrichment)'),
  CRAWLER_MAX_REDIRECTS: z.coerce.number().default(5),
  CRAWLER_TIMEOUT_MS: z.coerce.number().default(10000),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),

  // MinIO/S3
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z
    .preprocess(booleanPreprocess, z.coerce.boolean())
    .default(false),
  MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  MINIO_BUCKET_NAME: z.string().default('user-doc-chat'),
  MINIO_DEFAULT_BUCKET: z.string().default('user-files'),

  // Python HTTP Service
  PYTHON_LLM_URL: z.string().url().default('http://localhost:8000/embed'),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

// Parse and validate environment variables
let configInitialized = false;
let configProxy: z.infer<typeof envSchema> | null = null;

function parseConfig() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(
        {
          issues: error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
          errorCount: error.issues.length,
        },
        'Configuration validation failed',
      );
      process.exit(1);
    }
    throw error;
  }
}

// Initialize config - lazy for test mode
function initializeConfig() {
  if (!configInitialized) {
    const parsedConfig = parseConfig();
    configInitialized = true;
    configProxy = parsedConfig;
    return parsedConfig;
  }
  return configProxy;
}

// Lazy initialization - config will be parsed when first accessed

// Export function to re-parse config (useful for tests)
export function reparseConfig() {
  const parsedConfig = parseConfig();
  return parsedConfig;
}

// Export initializeConfig for test environments
export { initializeConfig };

// Export config with lazy initialization for test mode

export const config = new Proxy({} as z.infer<typeof envSchema>, {
  get(target, prop) {
    if (!configInitialized || !configProxy) {
      configProxy = initializeConfig();
    }
    return configProxy![prop as keyof typeof configProxy];
  },
});
