// Mock API responses and database responses

export const mockDatabaseResponses = {
  userInsert: {
    rows: [
      {
        id: 'user1',
        email: 'test@example.com',
        created_at: new Date('2020-01-01T00:00:00.000Z'),
      },
    ],
  },
  fileInsert: {
    rows: [{ id: 'file123', userId: 'user123', originalName: 'document.pdf' }],
  },
  chatInsert: {
    rows: [{ id: 'chat-1' }],
  },
  emptyResult: {
    rows: [],
  },
};

export const mockApiResponses = {
  huggingFace: {
    featureExtraction: [0.1, 0.2, 0.3],
    chatCompletion: {
      choices: [{ message: { content: 'Hello world.' } }],
    },
  },
  searchResults: [
    {
      title: 'Test Result 1',
      snippet: 'This is the first test result snippet',
      url: 'https://example.com/result1',
    },
  ],
  fileTypeDetection: {
    ext: 'pdf',
    mime: 'application/pdf',
  },
};

export const mockErrorResponses = {
  databaseError: new Error('Database connection failed'),
  networkError: new Error('Network request failed'),
  validationError: new Error('Invalid input data'),
  authenticationError: new Error('Authentication failed'),
};
