import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for e2e tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    setupFiles: ['./src/tests/e2e/setup.ts'],
    include: ['src/tests/e2e/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'src/tests/**',
        'dist/**',
        'node_modules/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
      ],
    },
  },
});
