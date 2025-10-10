import { defineConfig } from 'vitest/config';

// @ts-expect-error ignoring this as there is some conflict with the tsconfig
export default defineConfig(async () => {
  const tsconfigPaths = await import('vite-tsconfig-paths');
  return {
    plugins: [tsconfigPaths.default()],
    test: {
      globals: true,
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
      },
      setupFiles: ['./src/tests/setup.ts'],
    },
  };
});
