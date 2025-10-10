/**
 * PostgreSQL container management
 * Provides container lifecycle management for integration tests
 */

import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { logger } from '../../../config/logger.config';
import type {
  DatabaseContainer,
  DatabaseContainerConfig,
} from '../../../shared/types/container.types';

export class PostgresContainerManager {
  private container: StartedPostgreSqlContainer | null = null;
  private config: DatabaseContainerConfig;

  constructor(config: Partial<DatabaseContainerConfig> = {}) {
    this.config = {
      image: 'postgres:15-alpine',
      tag: '15-alpine',
      ports: [5432],
      environment: {
        POSTGRES_DB: 'test_user_doc_chat',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
      },
      database: 'test_user_doc_chat',
      user: 'test_user',
      password: 'test_password',
      ...config,
    };
  }

  async start(): Promise<DatabaseContainer> {
    if (this.container) {
      return this.createContainerInterface();
    }

    this.container = await new PostgreSqlContainer(this.config.image)
      .withDatabase(this.config.environment.POSTGRES_DB)
      .withUsername(this.config.environment.POSTGRES_USER)
      .withPassword(this.config.environment.POSTGRES_PASSWORD)
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
      // Simple health check - container is running if we can get connection string
      const connectionString = this.container.getConnectionUri();
      return !!connectionString;
    } catch (error) {
      logger.debug({ error }, 'PostgreSQL health check failed');
      return false;
    }
  }

  async executeSql(sql: string): Promise<void> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    // For now, just log the SQL - in a real implementation,
    // you would use a PostgreSQL client to execute the SQL
    logger.debug({ sql }, 'Executing SQL');
  }

  getLogs(): string {
    if (!this.container) return '';
    // testcontainers doesn't provide getLogs method directly
    return 'Container logs not available';
  }

  private createContainerInterface(): DatabaseContainer {
    if (!this.container) {
      throw new Error('Container not started');
    }

    return {
      container: this.container,
      connectionString: this.container.getConnectionUri(),
      host: this.container.getHost(),
      port: this.container.getMappedPort(5432),
      database: this.config.environment.POSTGRES_DB,
      user: this.config.environment.POSTGRES_USER,
      password: this.config.environment.POSTGRES_PASSWORD,
      isHealthy: () => this.isHealthy(),
      executeSql: (sql: string) => this.executeSql(sql),
      getLogs: () => this.getLogs(),
    };
  }
}

export const postgresContainerManager = new PostgresContainerManager();
