import pino, { LoggerOptions } from 'pino';

// Create logger with fallback for early initialization
const createLogger = (): pino.Logger => {
  try {
    // Try to import config - this might fail during early initialization
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require('./app.config');

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

    return pino(options);
  } catch (error) {
    // Fallback logger for early initialization when config is not available
    // This ensures we can log startup errors and configuration issues
    const fallbackOptions: LoggerOptions = {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    };

    const fallbackLogger = pino(fallbackOptions);

    // Log the fallback initialization for debugging
    fallbackLogger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
        reason: 'config-not-ready',
      },
      'Using fallback logger - config not yet initialized',
    );

    return fallbackLogger;
  }
};

export const logger = createLogger();
