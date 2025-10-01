// Mock factory functions for services
// These return the mock implementations directly to avoid hoisting issues

export const createLLMServiceMock = () => ({
  getEmbedding: async () => [0.1, 0.2],
  generateAnswerStream: async function* () {
    yield 'Hello';
    yield ' World';
  },
  chunkText: (text: string, chunkSize: number, overlap: number) => {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  },
  generateLowSummary: async (chunks: string[], _options: unknown) => {
    return chunks.map((chunk: string) => `Summary of: ${chunk}`).join(' ');
  },
});

export const createVectorStoreServiceMock = () => ({
  query: async () => ({ matches: [] }),
  getContextWithSummarization: async () => 'context',
});

export const createEnrichmentServiceMock = () => () => {};

export const createPromptServiceMock = () => ({
  sanitizeText: (text: string) => text,
});

export const createJwtUtilsMock = () => ({
  verifyJwt: () => ({ sub: 'user-123' }),
});

export const createHashUtilsMock = () => ({
  hashPassword: async (password: string) => `hashed_${password}`,
  comparePassword: async (password: string, hash: string) =>
    hash === `hashed_${password}`,
});

export const createSocketIOServerMock = () => {
  const mockServer = {
    use: (middleware: unknown) => {
      (mockServer as any)._authMiddleware = middleware;
      return mockServer;
    },
    on: () => {},
    to: () => ({ emit: () => {} }),
  };
  return mockServer;
};
