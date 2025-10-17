import { z } from 'zod';

export const QuestionPayloadSchema = z.object({
  fileId: z
    .string()
    .min(1, 'fileId is required and must be a non-empty string')
    .uuid('fileId must be a valid UUID'),
  question: z
    .string()
    .min(1, 'question is required and must be a non-empty string')
    .max(2000, 'question must not exceed 2000 characters')
    .trim(),
});

export const WebSocketConnectionSchema = z.object({
  socketId: z.string().min(1, 'socketId is required'),
  userId: z.string().uuid('userId must be a valid UUID'),
  connectedAt: z.date().optional(),
});

export const WebSocketEventSchema = z.object({
  event: z.string().min(1, 'event name is required'),
  data: z.unknown(),
  timestamp: z.date().default(() => new Date()),
});

export const WebSocketErrorSchema = z.object({
  code: z.string().min(1, 'error code is required'),
  message: z.string().min(1, 'error message is required'),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.date().default(() => new Date()),
});

export const WebSocketMessageSchema = z.object({
  type: z.enum(['question', 'response', 'error', 'status']),
  payload: z.unknown(),
  metadata: z.object({
    userId: z.string().uuid(),
    sessionId: z.string().uuid().optional(),
    timestamp: z.date().default(() => new Date()),
  }),
});

export const WebSocketAuthenticationSchema = z.object({
  token: z.string().min(1, 'token is required'),
  source: z.enum(['header', 'auth', 'query']),
  userId: z.string().uuid().optional(),
  expiresAt: z.date().optional(),
});

export const WebSocketConnectionStatsSchema = z.object({
  totalConnections: z.number().int().min(0),
  uniqueUsers: z.number().int().min(0),
  connectionsPerUser: z.record(z.string(), z.number().int().min(0)),
  averageConnectionsPerUser: z.number().min(0),
  peakConnections: z.number().int().min(0).optional(),
});

export type QuestionPayload = z.infer<typeof QuestionPayloadSchema>;
export type WebSocketConnection = z.infer<typeof WebSocketConnectionSchema>;
export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;
export type WebSocketError = z.infer<typeof WebSocketErrorSchema>;
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
export type WebSocketAuthentication = z.infer<
  typeof WebSocketAuthenticationSchema
>;
export type WebSocketConnectionStats = z.infer<
  typeof WebSocketConnectionStatsSchema
>;
