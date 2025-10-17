import { beforeAll } from 'vitest';

// Global test setup for infrastructure tests
beforeAll(() => {
  // Set up any global configuration needed for infrastructure tests
  process.env.NODE_ENV = 'test';
});
