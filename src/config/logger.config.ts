import pino, { LoggerOptions } from 'pino';
import { config } from './app.config';

// Configure different logging for production and development
const options: LoggerOptions =
  config.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
        level: config.LOG_LEVEL,
      }
    : {
        // Pretty printing in prod is optional; keep JSON by default.
        level: config.LOG_LEVEL,
      };

export const logger = pino(options);
