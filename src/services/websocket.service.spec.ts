/**
 * WebsocketService unit tests
 * Testing library/framework: Jest (assumed via ts-jest based on common TS setups).
 * If this repository uses Vitest, replace jest.fn/expect with vi.fn/expect and adjust mocks accordingly.
 */

 // Mocks must be defined before requiring the service under test.

const serverSentinel: any = { __server: true };

jest.mock('http', () => {
  const createServer = jest.fn(() => serverSentinel);
  return { __esModule: true, default: { createServer }, createServer };
});

// Create a constructor mock for socket.io Server that captures middleware/handlers and reuses a single emitter.
jest.mock('socket.io', () => {
  const Server = jest.fn(function (this: any) {
    this.middlewares = [] as any[];
    this.handlers = {} as Record<string, any>;
    const emitter = { emit: jest.fn() };
    this.to = jest.fn(() => emitter);
    this.use = jest.fn((fn: any) => { this.middlewares.push(fn); });
    this.on = jest.fn((event: string, cb: any) => { this.handlers[event] = cb; });
  });
  return { __esModule: true, Server };
});

jest.mock('../utils/jwt', () => ({ __esModule: true, verifyJwt: jest.fn() }));

jest.mock('./llm.service', () => ({
  __esModule: true,
  LLMService: jest.fn().mockImplementation(() => ({
    embeddingHF: jest.fn(),
    generateAnswerStream: jest.fn(),
    enrichmentService: undefined
  })),
}));

jest.mock('./vector-store.service', () => ({
  __esModule: true,
  VectorStoreService: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    getContextWithSummarization: jest.fn(),
  })),
}));

jest.mock('./enrichment.service', () => ({
  __esModule: true,
  EnrichmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../repos/redis.repo', () => ({
  __esModule: true,
  redisChatHistory: {
    rPush: jest.fn(),
    expire: jest.fn(),
    lRange: jest.fn(),
    lTrim: jest.fn(),
  },
}));

jest.mock('../schemas/user-input.schema', () => ({
  __esModule: true,
  UserInputSchema: { parse: jest.fn((x: any) => x) },
}));

// Helper to build a fresh WebsocketService instance with clean singleton and mocks
function build() {
  jest.resetModules();

  const { WebsocketService } = require('./websocket.service') as typeof import('./websocket.service');
  // Clear singleton to avoid cross-test contamination
  (WebsocketService as any).instance = undefined;

  const service = WebsocketService.getInstance({} as any);

  const { Server: SocketServerMock } = require('socket.io') as { Server: jest.Mock };
  const { verifyJwt } = require('../utils/jwt') as { verifyJwt: jest.Mock };
  const { LLMService } = require('./llm.service') as { LLMService: jest.Mock };
  const { VectorStoreService } = require('./vector-store.service') as { VectorStoreService: jest.Mock };
  const { redisChatHistory } = require('../repos/redis.repo') as typeof import('../repos/redis.repo');
  const { UserInputSchema } = require('../schemas/user-input.schema') as typeof import('../schemas/user-input.schema');

  // Access underlying io mock internals
  const io: any = (service as any).io;

  // Silence console noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  return {
    service,
    io,
    SocketServerMock,
    verifyJwtMock: verifyJwt,
    llmInstance: (LLMService as any).mock.instances[0],
    vectorInstance: (VectorStoreService as any).mock.instances[0],
    redisChatHistory,
    UserInputSchema,
  };
}

function createFakeSocket(userId = 'u1') {
  const handlers: Record<string, any> = {};
  const socket: any = {
    handshake: { auth: {} },
    on: jest.fn((event: string, cb: any) => { handlers[event] = cb; }),
    emit: jest.fn(),
    join: jest.fn(),
    getHandler: (event: string) => handlers[event],
    userId,
  };
  return socket;
}

describe('WebsocketService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('getInstance returns a singleton and constructs socket server once', () => {
    jest.resetModules();
    const { WebsocketService } = require('./websocket.service') as typeof import('./websocket.service');
    const { Server: SocketServerMock } = require('socket.io') as { Server: jest.Mock };

    (WebsocketService as any).instance = undefined;
    const a = WebsocketService.getInstance({} as any);
    const b = WebsocketService.getInstance({} as any);
    expect(a).toBe(b);
    expect(SocketServerMock).toHaveBeenCalledTimes(1);
  });

  describe('authVerification middleware', () => {
    test('rejects when no token is provided', () => {
      const { io } = build();
      const mw = io.middlewares[0];
      const socket = { handshake: { auth: {} } } as any;
      const next = jest.fn();

      mw(socket, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(String(err.message)).toMatch(/No token provided/i);
    });

    test('rejects when token is invalid', () => {
      const { io, verifyJwtMock } = build();
      verifyJwtMock.mockReturnValue(null);
      const mw = io.middlewares[0];
      const socket = { handshake: { auth: { token: 't' } } } as any;
      const next = jest.fn();

      mw(socket, next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(String(err.message)).toMatch(/Invalid token/i);
    });

    test('rejects when subject/id is missing in decoded token', () => {
      const { io, verifyJwtMock } = build();
      verifyJwtMock.mockReturnValue({ name: 'no-sub' });
      const mw = io.middlewares[0];
      const socket = { handshake: { auth: { token: 't' } } } as any;
      const next = jest.fn();

      mw(socket, next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(String(err.message)).toMatch(/missing subject\/id/i);
    });

    test('accepts when decoded has sub and attaches userId', () => {
      const { io, verifyJwtMock } = build();
      verifyJwtMock.mockReturnValue({ sub: 42 });
      const mw = io.middlewares[0];
      const socket: any = { handshake: { auth: { token: 't' } } };
      const next = jest.fn();

      mw(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.userId).toBe('42');
    });
  });

  describe('onConnection behavior', () => {
    test('joins user room and registers question listener', () => {
      const { io } = build();
      const connectionHandler = io.handlers['connection'];
      expect(typeof connectionHandler).toBe('function');

      const socket = createFakeSocket('u1');
      connectionHandler(socket);

      expect(socket.join).toHaveBeenCalledWith('u1');
      expect(typeof socket.getHandler('question')).toBe('function');
    });
  });

  describe('question handling', () => {
    test('emits fallback response when no relevant context is found', async () => {
      const { io, vectorInstance, llmInstance } = build();
      const connectionHandler = io.handlers['connection'];
      const socket = createFakeSocket('userA');
      connectionHandler(socket);

      // Arrange mocks
      (llmInstance.embeddingHF as jest.Mock).mockResolvedValue([0.1, 0.2]);
      (vectorInstance.query as jest.Mock).mockResolvedValue({ matches: [] });

      const questionHandler = socket.getHandler('question');

      await questionHandler({ fileId: 'file1', question: 'What is X?', chatHistory: [] });

      // Get the shared emitter and inspect calls
      const emitter = io.to('userA'); // returns the same emitter instance by design
      const calls = (emitter.emit as jest.Mock).mock.calls;

      const chunkCalls = calls.filter(([event]) => event === 'answer_chunk');
      expect(chunkCalls.length).toBeGreaterThanOrEqual(1);
      expect(chunkCalls.some(([, payload]) =>
        String(payload?.token || '').includes("No relevant context found"))).toBe(true);

      expect(calls.some(([event]) => event === 'answer_complete')).toBe(true);
      expect(vectorInstance.getContextWithSummarization).not.toHaveBeenCalled();
      expect(llmInstance.generateAnswerStream).not.toHaveBeenCalled();
    });

    test('streams tokens, updates chat history, trims, and completes when context exists', async () => {
      const {
        io,
        vectorInstance,
        llmInstance,
        redisChatHistory,
        UserInputSchema,
      } = build();

      const connectionHandler = io.handlers['connection'];
      const socket = createFakeSocket('u2');
      connectionHandler(socket);

      // Arrange mocks
      (llmInstance.embeddingHF as jest.Mock).mockResolvedValue([0.9, 0.1]);
      (vectorInstance.query as jest.Mock).mockResolvedValue({ matches: [{ id: 'm1', score: 0.99 }] });
      (vectorInstance.getContextWithSummarization as jest.Mock).mockResolvedValue('CTX');
      (redisChatHistory.lRange as jest.Mock).mockResolvedValue(['User: prev']);
      (UserInputSchema.parse as jest.Mock).mockImplementation((x: any) => ({ ...x, parsed: true }));

      (llmInstance.generateAnswerStream as jest.Mock).mockImplementation(async function* () {
        yield 'Hello ';
        yield 'world';
      });

      const questionHandler = socket.getHandler('question');
      await questionHandler({ fileId: 'file2', question: 'Greet me', chatHistory: [] });

      const key = 'chat:u2:file2';

      // Chat history updates
      expect(redisChatHistory.rPush).toHaveBeenCalledWith(key, 'User: Greet me');
      expect(redisChatHistory.expire).toHaveBeenCalledWith(key, 60 * 60 * 24);

      // Streamed tokens
      const emitter = io.to('u2');
      const calls = (emitter.emit as jest.Mock).mock.calls;
      const chunks = calls.filter(([event]) => event === 'answer_chunk').map(([, p]) => p.token).join('');
      expect(chunks).toContain('Hello ');
      expect(chunks).toContain('world');

      // Final chat history append with full answer and trim
      expect(redisChatHistory.rPush).toHaveBeenCalledWith(key, expect.stringMatching(/^AI:\s*Hello world/));
      expect(redisChatHistory.expire).toHaveBeenCalledWith(key, 60 * 60 * 24);
      expect(redisChatHistory.lTrim).toHaveBeenCalledWith(key, -100, -1);

      // Answer complete event
      expect(calls.some(([event]) => event === 'answer_complete')).toBe(true);

      // Prompt construction
      expect(UserInputSchema.parse).toHaveBeenCalledWith({
        question: 'Greet me',
        chatHistory: ['User: prev'],
        context: 'CTX',
      });
    });

    test('emits error when processing throws', async () => {
      const { io, llmInstance } = build();
      const connectionHandler = io.handlers['connection'];
      const socket = createFakeSocket('errUser');
      connectionHandler(socket);

      (llmInstance.embeddingHF as jest.Mock).mockRejectedValue(new Error('boom'));

      const questionHandler = socket.getHandler('question');
      await questionHandler({ fileId: 'f', question: 'Q', chatHistory: [] });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'something went wrong' });

      // Should not send any room messages in this path
      const emitter = io.to('errUser');
      expect((emitter.emit as jest.Mock).mock.calls.length).toBe(0);
    });
  });

  test('getServer returns the underlying HTTP server instance', () => {
    const { service } = build();
    expect(service.getServer()).toBe(serverSentinel);
  });
});