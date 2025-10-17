import { z } from 'zod';

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
    }),
  ),
});

export const FileValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
    }),
  ),
  mimeType: z.string().optional(),
  size: z.number().int().positive().optional(),
});

export const TextValidationSchema = z.object({
  input: z.string(),
  fieldName: z.string(),
  maxLength: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  required: z.boolean().default(true),
});

export const EmailValidationSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const PasswordValidationSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
    ),
});

export const URLValidationSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

export const UUIDValidationSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export const DateValidationSchema = z.object({
  date: z.string().datetime('Invalid date format'),
});

export const NumberRangeValidationSchema = z.object({
  value: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().default(false),
});

export const ArrayValidationSchema = z.object({
  array: z.array(z.unknown()),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  unique: z.boolean().default(false),
});

export const ObjectValidationSchema = z.object({
  object: z.record(z.string(), z.unknown()),
  requiredFields: z.array(z.string()),
  allowedFields: z.array(z.string()).optional(),
});

export const FileTypeValidationSchema = z.object({
  mimeType: z.enum([
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  maxSize: z
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024), // 50MB
});

export const SanitizationSchema = z.object({
  input: z.string(),
  removeHtml: z.boolean().default(true),
  removeScripts: z.boolean().default(true),
  removeStyles: z.boolean().default(false),
  normalizeWhitespace: z.boolean().default(true),
  maxLength: z.number().int().positive().optional(),
});

export const SecurityValidationSchema = z.object({
  input: z.string(),
  checkXSS: z.boolean().default(true),
  checkSQLInjection: z.boolean().default(true),
  checkPathTraversal: z.boolean().default(true),
  checkCommandInjection: z.boolean().default(true),
  allowedChars: z.string().optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type FileValidationResult = z.infer<typeof FileValidationResultSchema>;
export type TextValidation = z.infer<typeof TextValidationSchema>;
export type EmailValidation = z.infer<typeof EmailValidationSchema>;
export type PasswordValidation = z.infer<typeof PasswordValidationSchema>;
export type URLValidation = z.infer<typeof URLValidationSchema>;
export type UUIDValidation = z.infer<typeof UUIDValidationSchema>;
export type DateValidation = z.infer<typeof DateValidationSchema>;
export type NumberRangeValidation = z.infer<typeof NumberRangeValidationSchema>;
export type ArrayValidation = z.infer<typeof ArrayValidationSchema>;
export type ObjectValidation = z.infer<typeof ObjectValidationSchema>;
export type FileTypeValidation = z.infer<typeof FileTypeValidationSchema>;
export type Sanitization = z.infer<typeof SanitizationSchema>;
export type SecurityValidation = z.infer<typeof SecurityValidationSchema>;
