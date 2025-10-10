import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';

export default defineConfig(async (): Promise<UserConfig> => {
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
