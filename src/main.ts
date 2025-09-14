import express from 'express';
import { Server } from 'http';
import './events/file.event';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.route';
import fileRoutes from './routes/file.routes';
import { connectRedis } from './repos/redis.repo';
import { WebsocketService } from './services/websocket.service';
import { requestLogger } from './middleware/monitoring';
import { logger } from './config/logger';

(async () => {
  let server: Server | undefined;
  try {
    logger.info('Starting server initialization...');

    logger.info('Attempting to connect to Redis...');
    await connectRedis();
    logger.info('Successfully connected to Redis.');

    const app = express();
    logger.info('Express application initialized.');

    // Middlewares
    app.use(requestLogger);
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    logger.info('Global middlewares registered.');

    // Routes
    app.use('/health', healthRoutes);
    app.use('/auth', authRoutes);
    app.use('/file', fileRoutes);
    logger.info('API routes registered.');

    // Websocket Service
    logger.info('Initializing WebSocket service...');
    const socketService = WebsocketService.getInstance(app);
    logger.info('WebSocket service initialized.');

    // Start Server
    const PORT = process.env.PORT || 3000;
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
