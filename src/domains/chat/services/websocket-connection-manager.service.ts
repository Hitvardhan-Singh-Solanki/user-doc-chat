import { logger } from '@config/logger.config';
import type {
  AuthenticatedSocket,
  WebSocketConnectionManager,
  WebSocketEventEmitter,
} from '@shared/types';

export class WebSocketConnectionManagerService
  implements WebSocketConnectionManager, WebSocketEventEmitter
{
  private readonly connections = new Map<string, AuthenticatedSocket>();
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly log = logger.child({
    component: 'WebSocketConnectionManagerService',
  });

  addConnection(socket: AuthenticatedSocket): void {
    this.connections.set(socket.id, socket);

    if (!this.userConnections.has(socket.userId)) {
      this.userConnections.set(socket.userId, new Set());
    }
    this.userConnections.get(socket.userId)!.add(socket.id);

    this.log.info(
      { socketId: socket.id, userId: socket.userId },
      'WebSocket connection added',
    );
  }

  removeConnection(socketId: string): void {
    const socket = this.connections.get(socketId);
    if (socket) {
      this.connections.delete(socketId);

      const userConnections = this.userConnections.get(socket.userId);
      if (userConnections) {
        userConnections.delete(socketId);
        if (userConnections.size === 0) {
          this.userConnections.delete(socket.userId);
        }
      }

      this.log.info(
        { socketId, userId: socket.userId },
        'WebSocket connection removed',
      );
    }
  }

  getConnection(socketId: string): AuthenticatedSocket | undefined {
    return this.connections.get(socketId);
  }

  getAllConnections(): AuthenticatedSocket[] {
    return Array.from(this.connections.values());
  }

  getConnectionsForUser(userId: string): AuthenticatedSocket[] {
    const userSocketIds = this.userConnections.get(userId);
    if (!userSocketIds) {
      return [];
    }

    return Array.from(userSocketIds)
      .map((socketId) => this.connections.get(socketId))
      .filter((socket): socket is AuthenticatedSocket => socket !== undefined);
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    const userConnections = this.getConnectionsForUser(userId);

    userConnections.forEach((socket) => {
      try {
        socket.emit(event, data);
      } catch (error) {
        this.log.error(
          { error, socketId: socket.id, userId },
          'Failed to emit event to user',
        );
      }
    });

    this.log.debug(
      { userId, event, connectionCount: userConnections.length },
      'Event emitted to user',
    );
  }

  emitToSocket(socketId: string, event: string, data: unknown): void {
    const socket = this.getConnection(socketId);
    if (socket) {
      try {
        socket.emit(event, data);
        this.log.debug({ socketId, event }, 'Event emitted to socket');
      } catch (error) {
        this.log.error({ error, socketId }, 'Failed to emit event to socket');
      }
    }
  }

  broadcast(event: string, data: unknown): void {
    this.getAllConnections().forEach((socket) => {
      try {
        socket.emit(event, data);
      } catch (error) {
        this.log.error(
          { error, socketId: socket.id },
          'Failed to broadcast event',
        );
      }
    });

    this.log.debug(
      { event, connectionCount: this.connections.size },
      'Event broadcasted to all connections',
    );
  }

  getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    connectionsPerUser: Record<string, number>;
  } {
    const connectionsPerUser: Record<string, number> = {};

    for (const [userId, socketIds] of this.userConnections) {
      connectionsPerUser[userId] = socketIds.size;
    }

    return {
      totalConnections: this.connections.size,
      uniqueUsers: this.userConnections.size,
      connectionsPerUser,
    };
  }
}
