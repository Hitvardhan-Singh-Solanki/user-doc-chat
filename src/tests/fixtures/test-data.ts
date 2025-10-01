// Test data fixtures

// Fixed date for deterministic tests
const FIXED_DATE = new Date('2020-01-01T00:00:00Z');

export const mockUser = {
  id: 'user1',
  email: 'test@example.com',
  created_at: FIXED_DATE,
};

export const mockFile = {
  id: 'file123',
  userId: 'user1',
  originalName: 'document.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  key: 'mock-uuid-1234-document.pdf',
  createdAt: FIXED_DATE,
};

export const mockSearchResults = [
  {
    title: 'Test Result 1',
    snippet: 'This is the first test result snippet',
    url: 'https://example.com/result1',
  },
  {
    title: 'Test Result 2',
    snippet: 'This is the second test result snippet',
    url: 'https://example.com/result2',
  },
];

export const mockChatData = {
  id: 'chat-1',
  userId: 'user1',
  fileId: 'file123',
  messages: [
    {
      id: 'msg-1',
      chatId: 'chat-1',
      sender: 'user' as const,
      message: 'Hello',
      createdAt: FIXED_DATE,
    },
    {
      id: 'msg-2',
      chatId: 'chat-1',
      sender: 'ai' as const,
      message: 'Hello! How can I help you?',
      createdAt: FIXED_DATE,
    },
  ],
};

export const mockVectorData = {
  id: 'vector-1',
  embedding: [0.1, 0.2, 0.3],
  metadata: {
    userId: 'user1',
    fileId: 'file123',
    text: 'Sample text content',
  },
};

export const mockFileUploadData = {
  buffer: Buffer.from('mock file content'),
  originalname: 'document.pdf',
  mimetype: 'application/pdf',
  size: 1024,
};

export const mockJwtPayload = {
  sub: 'user1',
  email: 'test@example.com',
  iat: Math.floor(FIXED_DATE.getTime() / 1000),
  exp: Math.floor(FIXED_DATE.getTime() / 1000) + 3600,
};
