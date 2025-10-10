import { z } from 'zod';

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
  POSTGRES_PASSWORD: z.string(),
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

  // Security
  SALT_ROUNDS: z.coerce.number().default(10),
  JWT_MAX_AGE: z.coerce.number().default(86400), // 24 hours

  // AI/LLM
  HUGGINGFACE_CHAT_MODEL: z.string().default('microsoft/DialoGPT-medium'),
  HUGGINGFACE_EMBEDDING_MODEL: z
    .string()
    .default('sentence-transformers/all-MiniLM-L6-v2'),
  HUGGINGFACE_SUMMARY_MODEL: z.string().default('facebook/bart-large-cnn'),

  // Vector Store
  PINECONE_INDEX: z.string().default('user-doc-chat'),
  PINECONE_TOP_K: z.coerce.number().default(5),
  PINECONE_BATCH_SIZE: z.coerce.number().default(100),
  PINECONE_MAX_RETRIES: z.coerce.number().default(3),
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
let config: z.infer<typeof envSchema>;

function parseConfig() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // eslint-disable-next-line no-console
      console.error('❌ Configuration validation failed:');
      error.issues.forEach((err) => {
        // eslint-disable-next-line no-console
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

// Initialize config
config = parseConfig();

// Runtime security validation for production environments
if (config.NODE_ENV !== 'development') {
  if (!config.POSTGRES_PASSWORD || config.POSTGRES_PASSWORD === 'password') {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Security Error: POSTGRES_PASSWORD is required and cannot be the default "password" in non-development environments',
    );
    process.exit(1);
  }
}

// Export function to re-parse config (useful for tests)
export function reparseConfig() {
  config = parseConfig();
  return config;
}

export { config };

export const serverConfig = {
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  frontendUrl: config.FRONTEND_URL,
};

export const databaseConfig = {
  postgres: {
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    distanceOperator: config.POSTGRES_VECTOR_DISTANCE_OPERATOR,
  },
  redis: {
    url: config.REDIS_URL,
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    username: config.REDIS_USERNAME,
    tls: config.REDIS_TLS,
    db: config.REDIS_DB,
    socket: config.REDIS_SOCKET,
  },
};

export const authConfig = {
  jwtExpiresIn: config.JWT_EXPIRES_IN,
  saltRounds: config.SALT_ROUNDS,
  jwtMaxAge: config.JWT_MAX_AGE,
};

export const aiConfig = {
  huggingface: {
    chatModel: config.HUGGINGFACE_CHAT_MODEL,
    embeddingModel: config.HUGGINGFACE_EMBEDDING_MODEL,
    summaryModel: config.HUGGINGFACE_SUMMARY_MODEL,
  },
  pinecone: {
    index: config.PINECONE_INDEX,
    topK: config.PINECONE_TOP_K,
    batchSize: config.PINECONE_BATCH_SIZE,
    maxRetries: config.PINECONE_MAX_RETRIES,
  },
  vectorStoreProvider: config.VECTOR_STORE_PROVIDER,
};

export const processingConfig = {
  chunkSize: config.CHUNK_SIZE,
  chunkOverlap: config.CHUNK_OVERLAP,
  maxContextTokens: config.MAX_CONTEXT_TOKENS,
};

export const rateLimitConfig = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
};

export const fileConfig = {
  maxFileSize: config.MAX_FILE_SIZE,
};

export const corsConfig = {
  origins: config.CORS_ORIGINS,
};

export const storageConfig = {
  minio: {
    endpoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    bucketName: config.MINIO_BUCKET_NAME,
    defaultBucket: config.MINIO_DEFAULT_BUCKET,
  },
};

export const grpcConfig = {
  pythonUrl: config.PYTHON_LLM_URL,
};

export const crawlerConfig = {
  maxBytes: config.CRAWLER_MAX_BYTES,
  userAgent: config.CRAWLER_USER_AGENT,
  maxRedirects: config.CRAWLER_MAX_REDIRECTS,
  timeoutMs: config.CRAWLER_TIMEOUT_MS,
};

export const loggingConfig = {
  level: config.LOG_LEVEL,
};
