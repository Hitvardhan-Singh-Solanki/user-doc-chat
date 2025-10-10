import { z } from 'zod';

// Define the schema here to avoid circular imports
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.string().transform(Number).default(3000),
  HUGGINGFACE_CHAT_MODEL: z.string().default('microsoft/DialoGPT-medium'),
  HUGGINGFACE_EMBEDDING_MODEL: z
    .string()
    .default('sentence-transformers/all-MiniLM-L6-v2'),
  HUGGINGFACE_SUMMARY_MODEL: z.string().default('facebook/bart-large-cnn'),
  PINECONE_INDEX_NAME: z.string().default('legal-docs'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.string().transform(Number).default(9000),
  MINIO_USE_SSL: z
    .string()
    .transform((val) => val === 'true')
    .default(false),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().transform(Number).default(5432),
  POSTGRES_DB: z.string().default('user_doc_chat'),
  POSTGRES_USER: z.string().default('postgres'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default(6379),
  PYTHON_LLM_URL: z.string().default('http://localhost:8000'),
});

export type AppConfig = z.infer<typeof envSchema>;
