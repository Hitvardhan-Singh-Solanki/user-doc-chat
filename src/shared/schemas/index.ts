// Re-export all schemas from specialized schema files
export * from './websocket.schemas';
export * from './auth.schemas';
export * from './file.schemas';
export * from './config.schemas';
export * from './llm.schemas';
export * from './validation.schemas';

// Common validation utilities
export { z } from 'zod';

// Schema validation helper functions
export const validateSchema = <T>(schema: unknown, data: unknown): T => {
  return (schema as { parse: (data: unknown) => T }).parse(data);
};

export const safeValidateSchema = <T>(
  schema: unknown,
  data: unknown,
): { success: true; data: T } | { success: false; error: unknown } => {
  try {
    const result = (schema as { parse: (data: unknown) => T }).parse(data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error };
  }
};

export const validatePartialSchema = <T>(schema: unknown, data: unknown): T => {
  return (schema as { partial: () => { parse: (data: unknown) => T } })
    .partial()
    .parse(data);
};
