import { Counter, register } from 'prom-client';
import { Transform } from 'stream';
import pino from 'pino';

const logCounter = new Counter({
  name: 'app_log_count_total',
  help: 'Total number of log messages by level',
  labelNames: ['level'],
});

export const metrics = register;

export function createPinoMetricsTransport(): Transform {
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      if (chunk.level) {
        const pinoLevel = pino.levels.labels[chunk.level] || 'unknown';
        logCounter.labels(pinoLevel).inc();
      }
      this.push(JSON.stringify(chunk) + '\n');
      callback();
    },
  });
}
