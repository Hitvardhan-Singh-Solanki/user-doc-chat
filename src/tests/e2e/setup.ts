import 'dotenv/config';
import { vi } from 'vitest';

// Set up test environment variables for e2e tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'kcoFVz1RNik90pi2K0KCOkd94EIbr3OhRYAmkhFRB9g=';
process.env.JWT_EXPIRES_IN = '3600';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_MAX_AGE = '86400';

// gRPC service configuration for e2e tests
process.env.SANITIZER_HOST = 'localhost:50051';
process.env.SANITIZER_TIMEOUT = '10000';
process.env.SANITIZER_TLS_ENABLED = 'false';

// Database configuration for e2e tests (if needed)
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'user_doc_chat_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'test_password';

// Redis configuration for e2e tests (if needed)
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = 'test_password';

// Storage configuration for e2e tests (if needed)
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'test_access_key';
process.env.MINIO_SECRET_KEY = 'test_secret_key';
process.env.MINIO_USE_SSL = 'false';

// Mock external services that we don't want to test in e2e
vi.mock('minio', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      getObject: vi.fn().mockResolvedValue(Buffer.from('mock file content')),
      putObject: vi.fn().mockResolvedValue({ etag: 'mock-etag' }),
      removeObject: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation((_queueName, _processor) => {
      return {
        id: 'worker-123',
        close: vi.fn(),
        on: vi.fn(),
      };
    }),
    Queue: vi.fn().mockImplementation((queueName, _options) => {
      return {
        name: queueName,
        add: vi.fn(),
        getJobs: vi.fn(),
        clean: vi.fn(),
        close: vi.fn(),
      };
    }),
    QueueEvents: vi.fn().mockImplementation((queueName, _options) => {
      return {
        name: queueName,
        on: vi.fn(),
        close: vi.fn(),
      };
    }),
  };
});

// Mock external AI services
vi.mock('@huggingface/inference', () => ({
  HfInference: vi.fn().mockImplementation(() => ({
    featureExtraction: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
  InferenceClient: vi.fn().mockImplementation(() => ({
    textGeneration: vi.fn().mockResolvedValue({
      generated_text: 'This is a mock AI response for testing purposes.',
    }),
    featureExtraction: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    summarization: vi.fn().mockResolvedValue({
      summary_text: 'This is a mock summary for testing purposes.',
    }),
  })),
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(() => ({
    index: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
      query: vi.fn().mockResolvedValue({
        matches: [
          {
            id: 'test-id',
            score: 0.95,
            metadata: { content: 'test content' },
          },
        ],
      }),
    }),
  })),
}));

// Mock Xenova transformers to avoid HuggingFace tokenizer issues
vi.mock('@xenova/transformers', () => ({
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue({
      encode: vi.fn().mockReturnValue([1, 2, 3, 4, 5]),
      decode: vi.fn().mockReturnValue('decoded text'),
    }),
  },
}));

// Mock bcrypt for password hashing
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$10$hashedpassword'),
    compare: vi.fn().mockImplementation((password, hash) => {
      // For testing, always return true for valid passwords
      return Promise.resolve(
        password === 'testpassword123' || password === 'TestPassword123!',
      );
    }),
  },
  hash: vi.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: vi.fn().mockImplementation((password, hash) => {
    // For testing, always return true for valid passwords
    return Promise.resolve(
      password === 'testpassword123' || password === 'TestPassword123!',
    );
  }),
}));

// Mock email validation utilities
vi.mock('../../../shared/utils/email', () => ({
  normalizeEmail: vi.fn().mockImplementation((email: string) => {
    if (!email || typeof email !== 'string') return '';
    return email.trim().toLowerCase();
  }),
  isValidEmailFormat: vi.fn().mockImplementation((email: string) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }),
}));

// Mock jsonwebtoken library
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockImplementation((payload: any) => {
      return `mock-jwt-token-${payload.sub}`;
    }),
    verify: vi.fn().mockImplementation((token: string) => {
      if (token.includes('mock-jwt-token')) {
        return { sub: 'test-id', email: 'test@example.com' };
      }
      throw new Error('Invalid token');
    }),
  },
  sign: vi.fn().mockImplementation((payload: any) => {
    return `mock-jwt-token-${payload.sub}`;
  }),
  verify: vi.fn().mockImplementation((token: string) => {
    if (token.includes('mock-jwt-token')) {
      return { sub: 'test-id', email: 'test@example.com' };
    }
    throw new Error('Invalid token');
  }),
}));

// Mock express-jwt library
vi.mock('express-jwt', () => ({
  expressjwt: vi.fn().mockImplementation(() => {
    return (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      if (token === 'invalid-token') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Accept mock JWT tokens
      if (token.includes('mock-jwt-token')) {
        req.user = { sub: 'test-id', email: 'test@example.com' };
        return next();
      }

      // For other tokens, check if they're valid JWT format
      if (token.split('.').length === 3) {
        req.user = { sub: 'test-id', email: 'test@example.com' };
        return next();
      }

      return res.status(401).json({ error: 'Unauthorized' });
    };
  }),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

// Mock file-type library
vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ mime: 'text/plain' }),
}));

// Mock MinIO provider
vi.mock('../../../infrastructure/storage/providers/minio.provider', () => ({
  uploadFileToMinio: vi.fn().mockResolvedValue('mock-file-id'),
}));

// Mock BullMQ provider
vi.mock('../../../infrastructure/queue/providers/bullmq.provider', () => ({
  queueAdapter: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
  fileQueueName: 'test-file-queue',
}));

// Mock file upload service
vi.mock('../../../domains/files/services/file-upload.service', () => ({
  FileUploadService: vi.fn().mockImplementation(() => ({
    upload: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Global state for tracking registered users across test runs
const mockUserDatabase = new Set(['existing@example.com']);

// Mock database connections for e2e tests
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockImplementation((query, params) => {
      // Mock different responses based on query type
      if (query.includes('INSERT INTO users')) {
        const email = params[0];

        // Simulate duplicate email error
        if (mockUserDatabase.has(email)) {
          const error = new Error(
            'duplicate key value violates unique constraint',
          );
          (error as any).code = '23505';
          return Promise.reject(error);
        }

        // Add to registered users
        mockUserDatabase.add(email);

        return Promise.resolve({
          rows: [
            {
              id: 'test-id',
              email: email,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        });
      }

      if (
        query.includes(
          'SELECT id, email, password_hash, created_at FROM users WHERE email',
        )
      ) {
        const email = params[0];

        // Simulate user not found
        if (!mockUserDatabase.has(email)) {
          return Promise.resolve({
            rows: [],
            rowCount: 0,
          });
        }

        return Promise.resolve({
          rows: [
            {
              id: 'test-id',
              email: email,
              password_hash: '$2b$10$hashedpassword',
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        });
      }

      if (query.includes('SELECT COUNT(*) FROM users')) {
        return Promise.resolve({
          rows: [{ count: mockUserDatabase.size.toString() }],
          rowCount: 1,
        });
      }

      return Promise.resolve({
        rows: [{ id: 'test-id', email: 'test@example.com', name: 'Test User' }],
        rowCount: 1,
      });
    }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'test-id' }],
        rowCount: 1,
      }),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock Redis for e2e tests
vi.mock('redis', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue('test-value'),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    lRange: vi.fn().mockResolvedValue(['item1', 'item2']),
    rPush: vi.fn().mockResolvedValue(2),
    expire: vi.fn().mockResolvedValue(1),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(1),
    isReady: true,
    status: 'ready',
  })),
}));

// Global test utilities
global.testUtils = {
  createTestBuffer: (content: string) => Buffer.from(content, 'utf-8'),
  createTestPdf: () =>
    Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Hello World) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
0000000300 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
394
%%EOF`),
  waitFor: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  isCI: () => process.env.CI === 'true',
  skipIfNoPython: () => {
    // Skip tests if Python is not available locally and not in CI
    if (process.env.CI !== 'true') {
      try {
        const { execSync } = require('child_process');
        execSync('python --version', { stdio: 'ignore' });
      } catch (error) {
        return true; // Skip if Python is not available
      }
    }
    return false; // Don't skip
  },
  resetMockDatabase: () => {
    // Reset the mock database to initial state
    mockUserDatabase.clear();
    mockUserDatabase.add('existing@example.com');
  },
};

// Extend global types
declare global {
  var testUtils: {
    createTestBuffer: (content: string) => Buffer;
    createTestPdf: () => Buffer;
    waitFor: (ms: number) => Promise<void>;
    isCI: () => boolean;
    skipIfNoPython: () => boolean;
    resetMockDatabase: () => void;
  };
}
