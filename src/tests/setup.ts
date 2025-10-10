import 'dotenv/config';
import { vi } from 'vitest';
import { secretsManager } from '../config/secrets.config';

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

// Initialize secrets after environment setup
(async () => {
  try {
    await secretsManager.initialize();
  } catch (error) {
    console.error('Failed to initialize secrets in test setup:', error);
  }
})();
