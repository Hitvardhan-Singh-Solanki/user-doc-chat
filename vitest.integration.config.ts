/**
 * Vitest configuration for integration tests
 * Uses Testcontainers for real service dependencies
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
      testTimeout: 60000, // 60 seconds for container startup
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
      include: ['src/tests/integration/**/*.test.ts'],
      exclude: [
        'src/tests/performance/**',
        'src/**/*.unit.test.ts',
        'src/**/*.spec.ts',
      ],
    },
    envDir: resolve(process.cwd()),
  };
});
