/**
 * Vitest configuration for performance and memory tests
 * Optimized for performance monitoring and memory leak detection
 */

import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig(async (): Promise<UserConfig> => {
  const tsconfigPaths = await import('vite-tsconfig-paths');
  return {
    plugins: [tsconfigPaths.default()],
    test: {
      globals: true,
      environment: 'node',
      testTimeout: 300000, // 5 minutes for performance tests
      hookTimeout: 60000,
      teardownTimeout: 30000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'src/tests/**',
          'src/**/*.d.ts',
        ],
      },
      setupFiles: ['./src/tests/setup.ts'],
      env: {
        NODE_ENV: 'test',
      },
      include: ['src/tests/performance/**/*.test.ts'],
      exclude: [
        'src/tests/integration/**',
        'src/**/*.unit.test.ts',
        'src/**/*.spec.ts',
      ],
      // Performance test specific options
      pool: 'forks', // Use separate processes for memory isolation
      poolOptions: {
        forks: {
          singleFork: true, // Run tests in single fork for memory tracking
        },
      },
    },
    envDir: resolve(process.cwd()),
  };
});
