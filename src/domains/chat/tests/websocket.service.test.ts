import { describe, it, beforeEach, expect, vi } from 'vitest';
import { WebsocketService } from '../services/websocket.service';
import { redisChatHistory } from '../../../infrastructure/database/repositories/redis.repo';

vi.mock('../../../infrastructure/database/repositories/redis.repo', () => ({
  redisChatHistory: {
    rPush: vi.fn().mockResolvedValue(1),
    lRange: vi.fn().mockResolvedValue([]),
    expire: vi.fn().mockResolvedValue(1),
    lTrim: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('../../../infrastructure/database/repositories/postgres.repo', () => ({
  PostgresService: { getInstance: vi.fn(() => ({ query: vi.fn() })) },
}));

vi.mock('../services/llm.service', () => ({
  LLMService: vi.fn().mockImplementation(() => ({
    getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
    generateAnswerStream: async function* () {
      yield 'Hello';
      yield ' World';
    },
  })),
}));

vi.mock('../services/vector-store.service', () => ({
  VectorStoreService: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ matches: [] }),
    getContextWithSummarization: vi.fn().mockResolvedValue('context'),
  })),
}));

vi.mock('../../../shared/utils/jwt', () => ({
  verifyJwt: vi.fn(() => ({ sub: 'user-123' })),
}));

vi.mock('../services/enrichment.service', () => ({
  EnrichmentService: vi.fn(),
}));

// Mock socket.io Server
const mockIo = {
  use: vi.fn((middleware) => {
    mockIo._authMiddleware = middleware;
    return mockIo;
  }),
  on: vi.fn(),
  to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  _authMiddleware: null as any,
};

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => mockIo),
}));

describe('WebsocketService', () => {
  let app: any;
  let ws: WebsocketService;

  beforeEach(() => {
    app = { use: vi.fn() };
    vi.clearAllMocks();

    // Reset singleton instance before each test
    (WebsocketService as any).instance = null;

    // Reset the middleware storage
    mockIo._authMiddleware = null;

    // Create the service - this will call authVerification() which calls io.use()
    ws = WebsocketService.getInstance(app);

    // Setup Redis mock to return resolved values
    vi.mocked(redisChatHistory.rPush).mockResolvedValue(1);
    vi.mocked(redisChatHistory.lRange).mockResolvedValue([]);
    vi.mocked(redisChatHistory.expire).mockResolvedValue(1);
    vi.mocked(redisChatHistory.lTrim).mockResolvedValue('OK');
  });

  it('should be a singleton', () => {
    const instance2 = WebsocketService.getInstance(app);
    expect(ws).toBe(instance2);
  });

  it('authVerification sets userId correctly', async () => {
    const socket: any = { handshake: { auth: { token: 'token' } } };
    const next = vi.fn();

    // Get the stored middleware from our mock
    const middlewareFn = mockIo._authMiddleware;

    // Ensure middleware function exists
    expect(middlewareFn).toBeDefined();
    expect(typeof middlewareFn).toBe('function');

    // Call the middleware
    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalled();
    expect(socket.userId).toBe('user-123');
  });

  it('processQuestion with no Pinecone matches', async () => {
    const dbMock = (ws as any).db;
    dbMock.query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'chat-1' }] })
      .mockResolvedValue({ rowCount: 1, rows: [] }); // for appendChatMessage calls

    // Mock the LLM service to return embedding
    (ws as any).llmService = {
      getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
    };

    // Mock the Pinecone service to return no matches
    (ws as any).pineconeService = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
    };

    const emitMock = vi.fn();
    mockIo.to = vi.fn().mockReturnValue({ emit: emitMock });

    await (ws as any).processQuestion('hi', 'user-123', 'file-1');

    expect(redisChatHistory.rPush).toHaveBeenCalledWith(
      'chat:user-123:file-1',
      'User: hi',
    );
    expect(redisChatHistory.rPush).toHaveBeenCalledWith(
      'chat:user-123:file-1',
      "AI: No relevant context found. I don't know the answer.",
    );

    expect(emitMock).toHaveBeenCalledWith('answer_chunk', {
      token: "No relevant context found. I don't know the answer.",
    });
    expect(emitMock).toHaveBeenCalledWith('answer_complete');
  });

  it('processQuestion with Pinecone matches streams LLM', async () => {
    const dbMock = (ws as any).db;

    // Mock getOrCreateChat: first query returns rowCount=0, second query simulates INSERT returning chat ID
    dbMock.query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) /// no existing chat
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'chat-1' }] }); // insert new chat

    const emitMock = vi.fn();
    vi.spyOn(ws.io, 'to').mockReturnValue({ emit: emitMock } as any);

    // Ensure Pinecone returns matches
    (ws as any).pineconeService.query = vi
      .fn()
      .mockResolvedValue({ matches: [{}] });
    (ws as any).pineconeService.getContextWithSummarization = vi
      .fn()
      .mockResolvedValue('ctx');

    await (ws as any).processQuestion('hi', 'user-123', 'file-1');

    // Now redisChatHistory should have been called
    expect(redisChatHistory.rPush).toHaveBeenCalledWith(
      'chat:user-123:file-1',
      'User: hi',
    );
    expect(redisChatHistory.rPush).toHaveBeenCalledWith(
      'chat:user-123:file-1',
      'AI: Hello World',
    );

    expect(emitMock).toHaveBeenCalledWith('answer_chunk', { token: 'Hello' });
    expect(emitMock).toHaveBeenCalledWith('answer_chunk', { token: ' World' });
    expect(emitMock).toHaveBeenCalledWith('answer_complete');
  });

  it('appendChatHistory calls Redis correctly', async () => {
    await (ws as any).appendChatHistory('u1', 'f1', 'msg');
    expect(redisChatHistory.rPush).toHaveBeenCalledWith('chat:u1:f1', 'msg');
    expect(redisChatHistory.expire).toHaveBeenCalledWith(
      'chat:u1:f1',
      60 * 60 * 24,
    );
  });

  it('getChatHistory calls Redis correctly', async () => {
    const history = await (ws as any).getChatHistory('u1', 'f1');
    expect(history).toEqual([]);
  });

  it('trimChatHistory calls Redis correctly', async () => {
    await (ws as any).trimChatHistory('u1', 'f1', 50);
    expect(redisChatHistory.lTrim).toHaveBeenCalledWith('chat:u1:f1', -50, -1);
  });

  it('getOrCreateChat creates new chat if none exists', async () => {
    const db = (ws as any).db;
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no existing
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'chat-1' }] }); // insert
    const chatId = await (ws as any).getOrCreateChat('user-123', 'file-1');
    expect(chatId).toBe('chat-1');
  });

  it('appendChatMessage calls DB correctly', async () => {
    const db = (ws as any).db;
    await (ws as any).appendChatMessage('chat-1', 'user', 'hi');
    expect(db.query).toHaveBeenCalledWith(
      'INSERT INTO chat_messages(chat_id, sender, message) VALUES($1, $2, $3)',
      ['chat-1', 'user', 'hi'],
    );
  });
});
