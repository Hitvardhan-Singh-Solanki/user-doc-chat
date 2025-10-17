/**
 * WebSocket service types and interfaces
 */

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
