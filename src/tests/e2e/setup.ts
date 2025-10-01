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
};

// Extend global types
declare global {
  var testUtils: {
    createTestBuffer: (content: string) => Buffer;
    createTestPdf: () => Buffer;
    waitFor: (ms: number) => Promise<void>;
    isCI: () => boolean;
  };
}
