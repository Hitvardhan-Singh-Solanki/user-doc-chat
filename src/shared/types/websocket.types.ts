import type { Socket } from 'socket.io';
import type { JwtPayload } from './index';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  decoded: JwtPayload;
  tokenExp?: number;
}

export interface QuestionPayload {
  fileId: string;
  question: string;
}

export interface SocketHandshake {
  headers: { authorization?: string };
  auth?: { token?: string };
  address: string;
}

export interface DecodedToken {
  sub?: string;
  id?: string;
  userId?: string;
  iat?: number;
  exp?: number;
}

export interface LegacyTokenData {
  id?: string;
  userId?: string;
  iat?: number;
  exp?: number;
}

export interface WebSocketServiceConfig {
  cors: {
    origin: string;
    methods: string[];
  };
}

export interface WebSocketError {
  message: string;
  code?: string;
}

export interface WebSocketAuthenticationResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export interface WebSocketMessageHandler {
  handleMessage(
    socket: AuthenticatedSocket,
    payload: QuestionPayload,
  ): Promise<void>;
}

export interface WebSocketConnectionManager {
  addConnection(socket: AuthenticatedSocket): void;
  removeConnection(socketId: string): void;
  getConnection(socketId: string): AuthenticatedSocket | undefined;
  getAllConnections(): AuthenticatedSocket[];
}

export interface WebSocketEventEmitter {
  emitToUser(userId: string, event: string, data: unknown): void;
  emitToSocket(socketId: string, event: string, data: unknown): void;
  broadcast(event: string, data: unknown): void;
}
