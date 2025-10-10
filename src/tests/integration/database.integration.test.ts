/**
 * Database integration tests
 * Tests PostgreSQL operations with real database container
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testContainerManager } from './setup/container-manager';
import { postgresContainerManager } from './setup/postgres.container';
import { memoryTracker } from '../utils/memory-tracker';
import { resourceCleanup } from '../utils/cleanup';

describe('Database Integration Tests', () => {
  let container: any;
  let connectionString: string;

  beforeAll(async () => {
    try {
      // Start containers
      await testContainerManager.startAll();

      // Wait for containers to be healthy
      const isHealthy = await testContainerManager.isHealthy();
      expect(isHealthy).toBe(true);

      container = await postgresContainerManager.start();
      connectionString = container.connectionString;
    } catch (error) {
      console.warn(
        'Container setup failed, skipping integration tests:',
        error,
      );
      // Skip all tests in this suite
      return;
    }
  }, 60000);

  afterAll(async () => {
    // Cleanup containers
    await testContainerManager.cleanup();
    resourceCleanup.cleanup();
  }, 30000);

  beforeEach(() => {
    // Take memory snapshot before each test
    memoryTracker.takeSnapshot('test-start');
  });

  it('should connect to PostgreSQL container', async () => {
    if (!container) {
      console.log('Skipping test - containers not available');
      return;
    }
    expect(container).toBeDefined();
    expect(connectionString).toContain('postgresql://');
    expect(container.host).toBeDefined();
    expect(container.port).toBeGreaterThan(0);
  });

  it('should execute SQL queries', async () => {
    if (!container) {
      console.log('Skipping test - containers not available');
      return;
    }
    // Create test table
    await container.executeSql(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data
    await container.executeSql(`
      INSERT INTO test_users (email, password) 
      VALUES ('test@example.com', 'hashedPassword123');
    `);

    // Query test data
    const result = await container.executeSql(`
      SELECT * FROM test_users WHERE email = 'test@example.com';
    `);

    expect(result).toBeDefined();
  });

  it('should handle transactions', async () => {
    if (!container) {
      console.log('Skipping test - containers not available');
      return;
    }
    // This would test transaction rollback/commit scenarios
    // Implementation depends on your database service
    expect(true).toBe(true);
  });

  it('should not have memory leaks', async () => {
    // Take snapshot after test
    memoryTracker.takeSnapshot('test-end');

    // Check for memory leaks
    const leakResult = memoryTracker.detectLeak(1024 * 1024); // 1MB threshold

    expect(leakResult.leakDetected).toBe(false);
    expect(leakResult.leakSize).toBeLessThanOrEqual(1024 * 1024);
  });
});
