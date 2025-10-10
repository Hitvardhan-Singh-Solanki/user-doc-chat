/**
 * Database fixtures
 * Provides sample database records for testing
 */

// import type { TestFixture } from '../../shared/types/mock.types';

// User fixtures
export const userFixtures = {
  validUser: {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashedPassword123',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  adminUser: {
    id: 'admin-123',
    email: 'admin@example.com',
    password: 'hashedAdminPassword123',
    role: 'admin',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  inactiveUser: {
    id: 'inactive-123',
    email: 'inactive@example.com',
    password: 'hashedPassword123',
    isActive: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// Chat fixtures
export const chatFixtures = {
  simpleChat: {
    id: 'chat-123',
    userId: 'user-123',
    fileId: 'file-123',
    title: 'Test Chat',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  longChat: {
    id: 'chat-456',
    userId: 'user-123',
    fileId: 'file-456',
    title: 'Long Test Chat',
    messageCount: 50,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// Message fixtures
export const messageFixtures = {
  userMessage: {
    id: 'msg-123',
    chatId: 'chat-123',
    sender: 'user',
    content: 'What is this document about?',
    timestamp: new Date('2024-01-01T00:00:00Z'),
  },
  aiMessage: {
    id: 'msg-456',
    chatId: 'chat-123',
    sender: 'ai',
    content: 'This document is about testing and development.',
    timestamp: new Date('2024-01-01T00:01:00Z'),
  },
  longMessage: {
    id: 'msg-789',
    chatId: 'chat-123',
    sender: 'ai',
    content:
      'This is a very long message that contains a lot of text to test how the system handles large responses and whether it properly truncates or processes them according to the configured limits.',
    timestamp: new Date('2024-01-01T00:02:00Z'),
  },
};

// File fixtures
export const fileFixtures = {
  textFile: {
    id: 'file-123',
    userId: 'user-123',
    filename: 'test-document.txt',
    originalName: 'test-document.txt',
    mimeType: 'text/plain',
    size: 1024,
    key: 'user-123/test-document.txt',
    bucket: 'user-files',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  pdfFile: {
    id: 'file-456',
    userId: 'user-123',
    filename: 'test-document.pdf',
    originalName: 'test-document.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    key: 'user-123/test-document.pdf',
    bucket: 'user-files',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  largeFile: {
    id: 'file-789',
    userId: 'user-123',
    filename: 'large-document.pdf',
    originalName: 'large-document.pdf',
    mimeType: 'application/pdf',
    size: 10485760, // 10MB
    key: 'user-123/large-document.pdf',
    bucket: 'user-files',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// Vector fixtures
export const vectorFixtures = {
  simpleVector: {
    id: 'vector-123',
    fileId: 'file-123',
    chunkIndex: 0,
    content: 'This is a test document chunk.',
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    metadata: {
      chunkSize: 100,
      startIndex: 0,
      endIndex: 100,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  multipleVectors: Array.from({ length: 5 }, (_, i) => ({
    id: `vector-${i + 1}`,
    fileId: 'file-123',
    chunkIndex: i,
    content: `This is test document chunk ${i + 1}.`,
    embedding: Array.from({ length: 384 }, () => Math.random()),
    metadata: {
      chunkSize: 100,
      startIndex: i * 100,
      endIndex: (i + 1) * 100,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
  })),
};

// Database fixture collections
export const databaseFixtures = {
  users: [
    userFixtures.validUser,
    userFixtures.adminUser,
    userFixtures.inactiveUser,
  ],
  chats: [chatFixtures.simpleChat, chatFixtures.longChat],
  messages: [
    messageFixtures.userMessage,
    messageFixtures.aiMessage,
    messageFixtures.longMessage,
  ],
  files: [fileFixtures.textFile, fileFixtures.pdfFile, fileFixtures.largeFile],
  vectors: [vectorFixtures.simpleVector, ...vectorFixtures.multipleVectors],
};

// Test fixture factory
export class DatabaseFixtureFactory {
  private static instance: DatabaseFixtureFactory;
  private fixtures: Map<string, unknown[]> = new Map();

  static getInstance(): DatabaseFixtureFactory {
    if (!DatabaseFixtureFactory.instance) {
      DatabaseFixtureFactory.instance = new DatabaseFixtureFactory();
    }
    return DatabaseFixtureFactory.instance;
  }

  loadFixtures(): void {
    this.fixtures.set('users', [...databaseFixtures.users]);
    this.fixtures.set('chats', [...databaseFixtures.chats]);
    this.fixtures.set('messages', [...databaseFixtures.messages]);
    this.fixtures.set('files', [...databaseFixtures.files]);
    this.fixtures.set('vectors', [...databaseFixtures.vectors]);
  }

  getFixtures<T>(table: string): T[] {
    return (this.fixtures.get(table) || []) as T[];
  }

  addFixture<T>(table: string, fixture: T): void {
    const fixtures = this.fixtures.get(table) || [];
    fixtures.push(fixture);
    this.fixtures.set(table, fixtures);
  }

  clearFixtures(): void {
    this.fixtures.clear();
  }

  resetFixtures(): void {
    this.clearFixtures();
    this.loadFixtures();
  }

  getFixtureCount(table: string): number {
    return this.fixtures.get(table)?.length || 0;
  }

  findFixture<T>(
    table: string,
    predicate: (item: T) => boolean,
  ): T | undefined {
    const fixtures = this.getFixtures<T>(table);
    return fixtures.find(predicate);
  }

  filterFixtures<T>(table: string, predicate: (item: T) => boolean): T[] {
    const fixtures = this.getFixtures<T>(table);
    return fixtures.filter(predicate);
  }
}

// Export singleton instance
export const databaseFixtureFactory = DatabaseFixtureFactory.getInstance();
