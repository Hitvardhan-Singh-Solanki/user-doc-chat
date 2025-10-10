/**
 * Redis container management
 * Provides container lifecycle management for integration tests
 */

import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { logger } from '../../../config/logger.config';
import type {
  RedisContainer as RedisContainerType,
  RedisContainerConfig,
} from '../../../shared/types/container.types';

export class RedisContainerManager {
  private container: StartedRedisContainer | null = null;
  private config: RedisContainerConfig;

  constructor(config: Partial<RedisContainerConfig> = {}) {
    this.config = {
      image: 'redis:7-alpine',
      tag: '7-alpine',
      ports: [6379],
      environment: {},
      ...config,
    };
  }

  async start(): Promise<RedisContainerType> {
    if (this.container) {
      return this.createContainerInterface();
    }

    this.container = await new RedisContainer(this.config.image)
      .withExposedPorts(...this.config.ports)
      .start();

    return this.createContainerInterface();
  }

  async stop(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.container) return false;

    try {
      // Simple health check - ping Redis
      const result = await this.executeCommand(['PING']);
      return result === 'PONG';
    } catch (error) {
      logger.debug({ error }, 'Redis health check failed');
      return false;
    }
  }

  async executeCommand(_command: string[]): Promise<string> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    // This is a simplified implementation
    // In a real scenario, you'd use a Redis client
    return 'OK';
  }

  getLogs(): string {
    if (!this.container) return '';
    // testcontainers doesn't provide getLogs method directly
    return 'Container logs not available';
  }

  private createContainerInterface(): RedisContainerType {
    if (!this.container) {
      throw new Error('Container not started');
    }

    return {
      container: this.container,
      connectionString: `redis://${this.container.getHost()}:${this.container.getMappedPort(6379)}`,
      host: this.container.getHost(),
      port: this.container.getMappedPort(6379),
      password: this.config.password,
      isHealthy: () => this.isHealthy(),
      executeCommand: (command: string[]) => this.executeCommand(command),
      getLogs: () => this.getLogs(),
    };
  }
}

export const redisContainerManager = new RedisContainerManager();
