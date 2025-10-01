import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for e2e tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    setupFiles: ['./src/tests/e2e/setup.ts'],
    include: ['src/tests/e2e/**/*.e2e.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'src/tests/auth/**/*.test.ts', // Exclude unit tests from e2e runs
      'src/tests/chat/**/*.test.ts',
      'src/tests/files/**/*.test.ts',
      'src/tests/vector/**/*.test.ts',
      'src/tests/infrastructure/**/*.test.ts',
      'src/tests/**/*.spec.ts', // Exclude spec tests from e2e runs
    ],
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
