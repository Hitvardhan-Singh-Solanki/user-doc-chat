import { Socket } from 'socket.io';

/**
 * WebSocket types for chat functionality
 */

export interface AuthenticatedSocket extends Socket {
  userId: string;
  tokenExp?: number;
}
