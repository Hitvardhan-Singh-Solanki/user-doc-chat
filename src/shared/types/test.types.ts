import { Request, NextFunction } from 'express';

export interface MockRequest extends Partial<Request> {
  ip?: string;
  headers: Record<string, string>;
  path: string;
  method: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  jsonData?: unknown;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (data: unknown) => void;
}

export interface MockNextFunction extends NextFunction {
  called: boolean;
  error?: Error;
}

export interface RateLimitError {
  remainingPoints: number;
  msBeforeNext: number;
}

export interface RedisConnectionError extends Error {
  code?: string;
  errno?: string;
}

export interface MockRateLimiterService {
  consumeGeneral: (key: string) => Promise<void>;
  consumeAuth: (key: string) => Promise<void>;
  consumeFileUpload: (key: string) => Promise<void>;
  getRateLimitInfo: (
    key: string,
    type: string,
  ) => Promise<{
    remainingPoints: number;
    msBeforeNext: number;
  }>;
}

export interface TestLogger {
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
  info: (data: Record<string, unknown>, message: string) => void;
}
