/**
 * LLM and AI service types and interfaces
 */

export interface LLMServiceConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
}

export interface LLMRequest {
  prompt: string;
  config?: Partial<LLMServiceConfig>;
  userId?: string;
  fileId?: string;
}

export interface LLMResponse {
  content: string;
  tokens: number;
  model: string;
  processingTime: number;
}

export interface LLMStreamResponse {
  content: string;
  isComplete: boolean;
  tokens?: number;
  model?: string;
}

export interface LLMError {
  code: string;
  message: string;
  model: string;
  timestamp: Date;
  retryable: boolean;
}

export interface LLMMetrics {
  requests: number;
  errors: number;
  averageResponseTime: number;
  totalTokens: number;
  modelUsage: Record<string, number>;
}

export interface LLMCircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  requestVolumeThreshold: number;
  sleepWindowInMilliseconds: number;
}

export interface LLMTimeoutConfig {
  requestTimeout: number;
  streamTimeout: number;
  connectionTimeout: number;
}

export interface LLMProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  timeout: number;
  retries: number;
  circuitBreaker: LLMCircuitBreakerConfig;
}

export interface LLMHealthCheck {
  isHealthy: boolean;
  lastCheck: Date;
  error?: string;
  responseTime?: number;
}

export interface LLMRateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
  currentUsage: number;
  resetTime: Date;
}

export interface LLMCacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  keyGenerator: (request: LLMRequest) => string;
}

export interface LLMRequestContext {
  userId: string;
  fileId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface LLMResponseMetadata {
  model: string;
  tokens: number;
  processingTime: number;
  cacheHit: boolean;
  retryCount: number;
}

export type LLMModel = 'gpt-3.5-turbo' | 'gpt-4' | 'claude-3' | 'llama-2';
export type LLMProvider = 'openai' | 'anthropic' | 'huggingface' | 'local';
export type LLMStatus = 'idle' | 'processing' | 'error' | 'rate_limited';
