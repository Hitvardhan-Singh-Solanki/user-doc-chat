// Mock factory functions for database and storage
// These return the mock implementations directly to avoid hoisting issues

export const createRedisChatHistoryMock = () => ({
  rPush: async () => 1,
  lRange: async () => [],
  expire: async () => 1,
  lTrim: async () => 'OK',
});

export const createPostgresServiceMock = () => ({
  getInstance: () => ({
    query: async <T = any>(..._args: any[]): Promise<{ rows: T[] }> => ({
      rows: [],
    }),
    withTransaction: async <T>(
      fn: (client: {
        query: <U = any>(...args: any[]) => Promise<{ rows: U[] }>;
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        query: async <U = any>(..._args: any[]): Promise<{ rows: U[] }> => ({
          rows: [],
        }),
      }),
  }),
});

export const createMinioProviderMock = () => ({
  uploadFileToMinio: async () => 'mock-key',
});

export const createQueueAdapterMock = () => ({
  enqueue: async () => 'mock-job-id',
});

export const mockFileQueueName = 'file-processing';
