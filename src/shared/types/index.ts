import { Response } from 'express';

// Re-export all types from specialized type files
export * from './websocket.types';
export * from './config.types';
export * from './regex.types';
export * from './ai.types';
export * from './file.types';
export * from './chat.types';
export * from './service.types';
export * from './llm.types';
export * from './database.types';
export * from './authentication.types';
export * from './timeout.types';
export * from './validation.types';

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export type VectorStoreType = 'pinecone' | 'pgvector';

export type Vector = {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
};

export interface JwtPayload {
  sub: string; // RFC-7519 compliant subject claim
  email: string;
  role?: string;
  // Legacy claims for migration support (deprecated)
  id?: string;
  userId?: string;
}

export type Client = {
  res: Response;
  queue?: string[];
  hasDrainHandler?: boolean;
  drainHandler?: () => void;
  errorHandler?: (err: Error) => void;
  closeHandler?: () => void;
};

export type SSEData = {
  fileId: string;
  status: 'failed' | 'processed' | 'processing';
  progress?: string | boolean | number | object;
  error: string | null;
};

export type DocStatus = 'new' | 'processing' | 'processed' | 'failed';
export type ISODateString = string;

export interface LegalDocument {
  id: string;
  source_name: string;
  source_url: string;
  law_type: string | null;
  jurisdiction: string | null;
  last_crawled: ISODateString | null;
  last_updated: ISODateString | null;
  status: DocStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface LegalDocumentJobData {
  id: string;
  source_url: string;
  law_type?: string;
  jurisdiction?: string;
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface EnrichmentOptions {
  maxResults?: number;
  maxPagesToFetch?: number;
  fetchConcurrency?: number;
  minContentLength?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  userId?: string;
  fileId?: string;
  sectionTitle?: string;
  source?: string;
}
