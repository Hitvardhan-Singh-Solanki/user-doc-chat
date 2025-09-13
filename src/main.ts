import express from 'express';
import './events/file.event';
import authRoutes from './routes/auth.routes';
import healthRoutes from './routes/health.route';
import fileRoutes from './routes/file.routes';
import { connectRedis } from './repos/redis.repo';
import { WebsocketService } from './services/websocket.service';

(async () => {
  try {
    console.log('Bootstrapping application...');
    console.log('Connecting to Redis...');
    await connectRedis();

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    console.log('Setting up routes...');
    app.use('/health', healthRoutes);
    app.use('/auth', authRoutes);
    app.use('/file', fileRoutes);

    console.log('Connecting to web-socket service...');
    const socketService = WebsocketService.getInstance(app);

    console.log('Starting server...');
    const PORT = process.env.PORT || 3000;
    socketService.getServer().listen(PORT, () => {
      console.log(`🚀 Backend running on port ${PORT}`);
      console.log(`✅ Express routes available at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error during application bootstrap:', error);
    process.exit(1);
  }
})();
