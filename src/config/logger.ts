import pino, { LoggerOptions } from 'pino';

// TODO: Different logging for production and development
const transport =
  process.env.NODE_ENV !== 'production'
    ? ({
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
          ignore: 'pid,hostname',
        },
      } as LoggerOptions)
    : ({
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
          ignore: 'pid,hostname',
        },
      } as LoggerOptions);

export const logger = pino(transport);
