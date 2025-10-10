/**
 * Unified container lifecycle management
 * Manages all test containers for integration tests
 */

import { postgresContainerManager } from './postgres.container';
import { redisContainerManager } from './redis.container';
import type {
  ContainerManager,
  ContainerTestEnvironment,
  DatabaseContainer,
  RedisContainer,
} from '../../../shared/types/container.types';
import { logger } from '../../../config/logger.config';

export class TestContainerManager implements ContainerManager {
  private containers: Map<string, DatabaseContainer | RedisContainer> =
    new Map();
  private isStarted = false;

  async startAll(): Promise<void> {
    if (this.isStarted) return;

    try {
      // Start PostgreSQL
      const postgres = await postgresContainerManager.start();
      this.containers.set('postgres', postgres);

      // Start Redis
      const redis = await redisContainerManager.start();
      this.containers.set('redis', redis);

      this.isStarted = true;
    } catch (error) {
      await this.stopAll();
      throw new Error(`Failed to start containers: ${error}`);
    }
  }

  async stopAll(): Promise<void> {
    try {
      await postgresContainerManager.stop();
      await redisContainerManager.stop();
      this.containers.clear();
      this.isStarted = false;
    } catch (error) {
      logger.warn({ error }, 'Error stopping containers');
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isStarted) return false;

    const postgres = this.containers.get('postgres');
    const redis = this.containers.get('redis');

    if (!postgres || !redis) return false;

    const postgresHealthy = await postgres.isHealthy();
    const redisHealthy = await redis.isHealthy();

    return postgresHealthy && redisHealthy;
  }

  getLogs(): Record<string, string> {
    const logs: Record<string, string> = {};

    this.containers.forEach((container, name) => {
      logs[name] = container.getLogs();
    });

    return logs;
  }

  async cleanup(): Promise<void> {
    await this.stopAll();
  }

  getTestEnvironment(): ContainerTestEnvironment {
    const postgres = this.containers.get('postgres') as DatabaseContainer;
    const redis = this.containers.get('redis') as RedisContainer;

    if (!postgres || !redis) {
      throw new Error('Containers not started');
    }

    return {
      database: {
        host: postgres.host,
        port: postgres.port,
        database: postgres.database,
        user: postgres.user,
        password: postgres.password,
        connectionString: postgres.connectionString,
      },
      redis: {
        host: redis.host,
        port: redis.port,
        password: redis.password || '',
        connectionString: redis.connectionString,
      },
      minio: {
        endpoint: 'localhost',
        port: 9000,
        accessKey: 'test-access-key',
        secretKey: 'test-secret-key',
        region: 'us-east-1',
        bucket: 'test-bucket',
      },
    };
  }
}

export const testContainerManager = new TestContainerManager();
