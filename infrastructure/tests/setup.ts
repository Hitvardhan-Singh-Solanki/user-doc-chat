import { beforeAll, afterAll } from 'vitest';

// Global test setup for infrastructure tests
beforeAll(async () => {
  // Set up test environment
  process.env.NODE_ENV = 'test';
  process.env.PULUMI_CONFIG_PASSPHRASE = 'test-passphrase';

  // Mock AWS credentials for testing
  process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.AWS_DEFAULT_REGION = 'us-west-2';
});

afterAll(async () => {
  // Clean up test environment
  delete process.env.PULUMI_CONFIG_PASSPHRASE;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_DEFAULT_REGION;
});
