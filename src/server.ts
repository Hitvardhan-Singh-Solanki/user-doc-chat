import { Server } from 'http';
import { connectRedis } from './infrastructure/database/repositories/redis.repo';
import { logger } from './config/logger.config';
import { createApp } from './app';
import { serviceFactory } from './shared/factories/service.factory';
import { config } from './config/app.config';

(async () => {
  let server: Server | undefined;
  try {
    logger.info('Starting server initialization...');

    logger.info('Attempting to connect to Redis...');
    await connectRedis();
    logger.info('Successfully connected to Redis.');

    const app = createApp();

    // Start Server
    const parsePort = (portStr: string | undefined): number => {
      const DEFAULT_PORT = 3000;
      const MIN_PORT = 0;
      const MAX_PORT = 65535;

      if (!portStr) {
        return DEFAULT_PORT;
      }

      const parsedPort = parseInt(portStr, 10);

      if (isNaN(parsedPort) || parsedPort < MIN_PORT || parsedPort > MAX_PORT) {
        logger.warn(
          {
            providedPort: portStr,
            parsedPort,
            defaultPort: DEFAULT_PORT,
          },
          'Invalid port value provided, falling back to default',
        );
        return DEFAULT_PORT;
      }

      return parsedPort;
    };

    const PORT: number = config.PORT;
    const socketService = serviceFactory.getWebsocketService(app);
    server = socketService.getServer().listen(PORT, () => {
      logger.info({ port: PORT }, `Server is listening on port ${PORT}`);
    });
  } catch (error) {
    logger.fatal(
      { err: (error as Error).message, stack: (error as Error).stack },
      'Server initialization failed. Shutting down.',
    );

    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  }
})();
