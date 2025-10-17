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
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'json', 'html'],
        reportsDirectory: './coverage',
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'src/**/*.test.js',
          'src/**/*.spec.js',
          'src/tests/**',
          'src/mocks/**',
          'src/fixtures/**',
          'src/**/*.d.ts',
          'dist/**',
          'node_modules/**',
        ],
        thresholds: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      },
      setupFiles: ['./src/tests/setup.ts'],
      env: {
        NODE_ENV: 'test',
      },
    },
    envDir: resolve(process.cwd()),
  };
});
