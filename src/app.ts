import express from 'express';
import './modules/files/events/file.event';
import authRoutes from './modules/auth/routes/auth.routes';
import healthRoutes from './modules/health/routes/health.route';
import fileRoutes from './modules/files/routes/file.routes';
import { WebsocketService } from './modules/chat/services/websocket.service';
import { requestLogger } from './common/middleware/monitoring';
import { logger } from './config/logger';

export function createApp(): express.Application {
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
  WebsocketService.getInstance(app);
  logger.info('WebSocket service initialized.');

  return app;
}
