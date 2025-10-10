// Load test environment variables FIRST, before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables from env.test file
config({ path: resolve(process.cwd(), 'env.test') });

// Set NODE_ENV to test to ensure proper config loading
process.env.NODE_ENV = 'test';

import { vi } from 'vitest';
import { initializeConfig } from '../config/app.config';

// Initialize config explicitly for tests
try {
  initializeConfig();
} catch (error) {
  console.warn('Failed to initialize config in test setup:', error);
}

// Initialize secrets for tests
try {
  const { secretsManager } = await import('../config/secrets.config');
  secretsManager.initialize();
} catch (error) {
  console.warn('Failed to initialize secrets in test setup:', error);
}

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

// Note: secretsManager.initialize() removed to prevent circular dependency
// Test environment variables are loaded via dotenv above
