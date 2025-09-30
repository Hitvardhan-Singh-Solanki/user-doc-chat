import express from 'express';
import './domains/files/events/file.event';
import authRoutes from './domains/auth/routes/auth.routes';
import healthRoutes from './domains/health/routes/health.route';
import fileRoutes from './domains/files/routes/file.routes';
import { WebsocketService } from './domains/chat/services/websocket.service';
import { requestLogger } from './shared/middleware/monitoring.middleware';
import { logger } from './config/logger.config';

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
