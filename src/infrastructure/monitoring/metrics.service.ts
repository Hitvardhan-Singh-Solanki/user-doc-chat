import { Counter, register } from 'prom-client';
import { Transform } from 'stream';
import pino from 'pino';

const logCounter = new Counter({
  name: 'app_log_count_total',
  help: 'Total number of log messages by level',
  labelNames: ['level'],
});

const errorCounter = new Counter({
  name: 'app_log_transform_errors_total',
  help: 'Total number of errors in log transform function',
  labelNames: ['error_type'],
});

export const metrics = register;

export function createPinoMetricsTransport(): Transform {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        processChunk(chunk);
        this.push(JSON.stringify(chunk) + '\n');
        callback();
      } catch (error) {
        handleTransformError(error, chunk);
        callback();
      }
    },
  });
}

function processChunk(chunk: { level?: number }): void {
  if (chunk.level !== undefined && chunk.level !== null) {
    const pinoLevel = pino.levels.labels[chunk.level] || 'unknown';
    logCounter.labels(pinoLevel).inc();
  }
}

function handleTransformError(error: unknown, chunk: unknown): void {
  const errorType =
    error instanceof Error ? error.constructor.name : 'UnknownError';
  errorCounter.labels(errorType).inc();

  const logger = pino({ name: 'metrics-service' });
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
      errorType,
      chunk: typeof chunk === 'object' ? '[object]' : String(chunk),
      stack: error instanceof Error ? error.stack : undefined,
    },
    'Error in pino metrics transform:',
  );
}
