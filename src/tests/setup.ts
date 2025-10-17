// Load test environment variables FIRST, before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables from env.test file
config({ path: resolve(process.cwd(), 'env.test') });

// Set NODE_ENV to test to ensure proper config loading
process.env.NODE_ENV = 'test';

// Polyfill for File API in Node.js environment
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    constructor(
      public chunks: unknown[],
      public filename: string,
      public options: Record<string, unknown> = {},
    ) {
      this.name = filename;
      this.size = 0;
      this.type = (options.type as string) || '';
      this.lastModified = (options.lastModified as number) || Date.now();
    }
    name: string;
    size: number;
    type: string;
    lastModified: number;
  } as unknown as typeof File;
}

// Polyfill for other browser APIs that might be needed
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(
      public chunks: unknown[] = [],
      public options: Record<string, unknown> = {},
    ) {
      this.size = 0;
      this.type = (options.type as string) || '';
    }
    size: number;
    type: string;
  } as unknown as typeof Blob;
}

if (typeof globalThis.FormData === 'undefined') {
  globalThis.FormData = class FormData {
    private data = new Map<string, unknown>();
    append(name: string, value: unknown) {
      this.data.set(name, value);
    }
    get(name: string) {
      return this.data.get(name);
    }
    has(name: string) {
      return this.data.has(name);
    }
    delete(name: string) {
      this.data.delete(name);
    }
    entries() {
      return this.data.entries();
    }
    keys() {
      return this.data.keys();
    }
    values() {
      return this.data.values();
    }
  } as unknown as typeof FormData;
}

import { vi } from 'vitest';
import { logger } from '../config/logger.config';
import { initializeConfig } from '../config/app.config';

// Initialize config explicitly for tests
try {
  initializeConfig();
} catch (error) {
  logger.debug({ error }, 'Failed to initialize config in test setup');
}

// Initialize secrets for tests
(async () => {
  try {
    const { secretsManager } = await import('../config/secrets.config');
    secretsManager.initialize();
  } catch (error) {
    logger.debug({ error }, 'Failed to initialize secrets in test setup');
  }
})();

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
