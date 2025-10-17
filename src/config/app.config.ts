import { z } from 'zod';
import { AppConfigSchema } from '@shared/schemas';
import { logger } from './logger.config';

const envSchema = AppConfigSchema;

// Parse and validate environment variables
let configInitialized = false;
let configProxy: z.infer<typeof envSchema> | null = null;

function parseConfig() {
  try {
    return envSchema.parse(process.env);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      logger.error(
        {
          issues: error.issues.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
          errorCount: error.issues.length,
        },
        'Configuration validation failed',
      );
      process.exit(1);
    }
    throw error;
  }
}

// Initialize config - lazy for test mode
function initializeConfig() {
  if (!configInitialized) {
    const parsedConfig = parseConfig();
    configInitialized = true;
    configProxy = parsedConfig;
    return parsedConfig;
  }
  return configProxy;
}

// Lazy initialization - config will be parsed when first accessed

// Export function to re-parse config (useful for tests)
export function reparseConfig() {
  const parsedConfig = parseConfig();
  return parsedConfig;
}

// Export initializeConfig for test environments
export { initializeConfig };

// Export config with lazy initialization for test mode

export const config = new Proxy({} as z.infer<typeof envSchema>, {
  get(target, prop) {
    if (!configInitialized || !configProxy) {
      configProxy = initializeConfig();
    }
    return configProxy![prop as keyof typeof configProxy];
  },
});
