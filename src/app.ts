import express from 'express';
import './domains/files/events/file.event';
import authRoutes from './domains/auth/routes/auth.routes';
import healthRoutes from './domains/health/routes/health.route';
import fileRoutes from './domains/files/routes/file.routes';
import { WebsocketService } from './domains/chat/services/websocket.service';
import { requestLogger } from './shared/middleware/monitoring.middleware';
import {
  securityHeaders,
  corsSecurity,
  requestSizeLimit,
  rateLimit,
  sanitizeInput,
  securityLogging,
  secureErrorHandler,
} from './shared/middleware/security.middleware';
import { jwtErrorHandler } from './shared/middleware/auth.middleware';
import { logger } from './config/logger.config';

export function createApp(): express.Application {
  const app = express();
  logger.info('Express application initialized.');

  // Security middlewares (order matters!)
  app.use(securityHeaders);
  app.use(corsSecurity);
  app.use(requestSizeLimit);
  app.use(rateLimit);
  app.use(securityLogging);

  // Request parsing middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(sanitizeInput);

  // Application middlewares
  app.use(requestLogger);
  logger.info('Global middlewares registered.');

  // Routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/file', fileRoutes);
  logger.info('API routes registered.');

  // Error handling middleware (must be after all routes)
  app.use(jwtErrorHandler); // Handle JWT errors first
  app.use(secureErrorHandler); // Handle all other errors

  // Websocket Service
  logger.info('Initializing WebSocket service...');
  WebsocketService.getInstance(app);
  logger.info('WebSocket service initialized.');

  return app;
}
