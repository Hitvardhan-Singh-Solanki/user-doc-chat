import { z } from 'zod';

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
  POSTGRES_PASSWORD: z.string().default('password'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_EXPIRES_IN: z.string().default('7d'),

  // AI/LLM
  HUGGINGFACE_CHAT_MODEL: z.string().default('microsoft/DialoGPT-medium'),
  HUGGINGFACE_EMBEDDING_MODEL: z
    .string()
    .default('sentence-transformers/all-MiniLM-L6-v2'),
  HUGGINGFACE_SUMMARY_MODEL: z.string().default('facebook/bart-large-cnn'),

  // Vector Store
  PINECONE_INDEX: z.string().default('user-doc-chat'),
  PINECONE_TOP_K: z.coerce.number().default(5),

  // Processing
  CHUNK_SIZE: z.coerce.number().default(800),
  CHUNK_OVERLAP: z.coerce.number().default(100),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // File Upload
  MAX_FILE_SIZE: z.coerce.number().default(52428800), // 50MB
  MAX_UPLOAD_BYTES: z.coerce.number().default(10485760), // 10MB

  // CORS
  CORS_ORIGINS: z
    .string()
    .transform((s) => s.split(',').map((o) => o.trim()))
    .default(() => ['http://localhost:3000']),

  // MinIO/S3
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_BUCKET_NAME: z.string().default('user-doc-chat'),

  // Python gRPC Service
  PYTHON_LLM_URL: z.string().default('localhost:50051'),

  // Logging
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

// Parse and validate environment variables
let config: z.infer<typeof envSchema>;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Configuration validation failed:');
    error.issues.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { config };
export type AppConfig = z.infer<typeof envSchema>;

// Export individual config sections for better organization
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
  },
  redis: {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
  },
};

export const authConfig = {
  jwtExpiresIn: config.JWT_EXPIRES_IN,
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
  },
};

export const processingConfig = {
  chunkSize: config.CHUNK_SIZE,
  chunkOverlap: config.CHUNK_OVERLAP,
};

export const rateLimitConfig = {
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
};

export const fileConfig = {
  maxFileSize: config.MAX_FILE_SIZE,
  maxUploadBytes: config.MAX_UPLOAD_BYTES,
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
  },
};

export const grpcConfig = {
  pythonUrl: config.PYTHON_LLM_URL,
};

export const loggingConfig = {
  level: config.LOG_LEVEL,
};
