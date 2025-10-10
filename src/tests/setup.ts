import 'dotenv/config';
import { vi } from 'vitest';

// Set up test environment variables
process.env.JWT_SECRET = '7v56BQvL5hcwyvGqYbKlpzFieI6ofF0Bo+FqbyAW7yk=';
process.env.JWT_EXPIRES_IN = '3600';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_MAX_AGE = '86400';

// Required secrets for tests
process.env.HUGGINGFACE_TOKEN = 'test-huggingface-token';
process.env.PINECONE_API_KEY = 'test-pinecone-api-key';
process.env.MINIO_ACCESS_KEY = 'test-minio-access-key';
process.env.MINIO_SECRET_KEY = 'test-minio-secret-key';
process.env.POSTGRES_PASSWORD = 'test-postgres-password';

vi.mock('minio', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      getObject: vi.fn(),
    })),
  };
});

vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation((/* _queueName, _processor */) => {
      return {
        id: 'worker-123',
        close: vi.fn(),
        on: vi.fn(),
      };
    }),
    Queue: vi.fn().mockImplementation((queueName /* _options */) => {
      return {
        name: queueName,
        add: vi.fn(),
        getJobs: vi.fn(),
        clean: vi.fn(),
        close: vi.fn(),
      };
    }),
    QueueEvents: vi.fn().mockImplementation((queueName /* _options */) => {
      return {
        name: queueName,
        on: vi.fn(),
        close: vi.fn(),
      };
    }),
  };
});

vi.mock('../service/minio', () => ({
  downloadFile: vi.fn().mockResolvedValue(Buffer.from('mock text')),
}));

vi.mock('../serive/minio', () => ({
  downloadFile: vi.fn(),
}));

vi.mock('../service/embeddings', () => ({
  chunkText: vi.fn(),
  embedText: vi.fn(),
}));

vi.mock('../service/pinecone', () => ({
  upsertVectors: vi.fn(),
}));

// Mock secrets manager to prevent initialization errors in tests
vi.mock('@config/secrets.config', () => ({
  secretsManager: {
    initialize: vi.fn(),
    getJwtSecret: vi.fn().mockReturnValue('7v56BQvL5hcwyvGqYbKlpzFieI6ofF0Bo+FqbyAW7yk='),
    getHuggingfaceToken: vi.fn().mockReturnValue('test-huggingface-token'),
    getPineconeApiKey: vi.fn().mockReturnValue('test-pinecone-api-key'),
    getMinioAccessKey: vi.fn().mockReturnValue('test-minio-access-key'),
    getMinioSecretKey: vi.fn().mockReturnValue('test-minio-secret-key'),
    getPostgresPassword: vi.fn().mockReturnValue('test-postgres-password'),
    getRedisPassword: vi.fn().mockReturnValue(undefined),
    getSanitizerHost: vi.fn().mockReturnValue(undefined),
    getSanitizerTimeout: vi.fn().mockReturnValue(undefined),
    getSanitizerConfig: vi.fn().mockReturnValue({
      host: 'localhost:50051',
      timeout: 5000,
    }),
  },
}));
