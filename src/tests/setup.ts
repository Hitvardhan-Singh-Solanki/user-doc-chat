import 'dotenv/config';
import { vi } from 'vitest';

vi.mock('minio', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      getObject: vi.fn(),
    })),
  };
});

vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation((_queueName, processor) => {
      return {
        id: 'worker-123',
        close: vi.fn(),
        on: vi.fn(),
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
