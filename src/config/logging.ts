import { createLogger, format, transports } from 'winston';
import { Request } from 'express';
import prometheusClient from 'prom-client';

// Prometheus metrics
const metrics = {
  httpRequestDuration: new prometheusClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
  }),
  tokenUsage: new prometheusClient.Counter({
    name: 'llm_token_usage_total',
    help: 'Total number of tokens used in LLM requests',
    labelNames: ['model', 'operation'],
  }),
  memoryUsage: new prometheusClient.Gauge({
    name: 'app_memory_usage_bytes',
    help: 'Memory usage in bytes',
  }),
  activeConnections: new prometheusClient.Gauge({
    name: 'websocket_active_connections',
    help: 'Number of active WebSocket connections',
  }),
};

// Configure Winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata(),
    format.json(),
  ),
  defaultMeta: { service: 'user-doc-chat' },
  transports: [
    new transports.Console(),
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Track memory usage
setInterval(() => {
  const used = process.memoryUsage();
  metrics.memoryUsage.set(used.heapUsed);
  logger.debug('Memory usage', {
    heap: used.heapUsed,
    rss: used.rss,
    external: used.external,
  });
}, 30000);

// Request logging middleware
export const requestLogger = (
  req: Request,
  statusCode: number,
  duration: number,
) => {
  const meta = {
    method: req.method,
    url: req.url,
    status: statusCode,
    duration,
    ip: req.ip,
    userId: req.user?.id,
  };

  metrics.httpRequestDuration
    .labels(req.method, req.route?.path || 'unknown', statusCode.toString())
    .observe(duration);

  if (statusCode >= 400) {
    logger.error('Request failed', meta);
  } else {
    logger.info('Request completed', meta);
  }
};

// Token usage tracking
export const trackTokenUsage = (
  model: string,
  operation: string,
  tokens: number,
) => {
  metrics.tokenUsage.labels(model, operation).inc(tokens);
  logger.debug('Token usage', { model, operation, tokens });
};

// WebSocket connection tracking
export const trackWSConnection = (connected: boolean) => {
  if (connected) {
    metrics.activeConnections.inc();
  } else {
    metrics.activeConnections.dec();
  }
};

export { logger, metrics };
