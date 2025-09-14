import pino, { LoggerOptions } from 'pino';

// TODO: Different logging for production and development
const options: LoggerOptions =
  process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
        level: process.env.LOG_LEVEL || 'debug',
      }
    : {
        // Pretty printing in prod is optional; keep JSON by default.
        level: process.env.LOG_LEVEL || 'info',
      };

export const logger = pino(options);
