/**
 * PostgreSQL container management
 * Provides container lifecycle management for integration tests
 */

import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type {
  DatabaseContainer,
  DatabaseContainerConfig,
} from '@types/container.types';

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
      // Simple health check - try to connect
      const client = await this.container.getConnection();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch {
      return false;
    }
  }

  async executeSql(sql: string): Promise<void> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    const client = await this.container.getConnection();
    await client.query(sql);
    await client.end();
  }

  getLogs(): string {
    if (!this.container) return '';
    return this.container.getLogs();
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
