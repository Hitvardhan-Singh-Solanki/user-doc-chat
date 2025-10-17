import { z } from 'zod';

export const UserInputSchema = z.object({
  question: z
    .string()
    .min(1, 'Question cannot be empty')
    .max(2000, 'Question must not exceed 2000 characters')
    .trim(),
  context: z
    .string()
    .max(50000, 'Context must not exceed 50000 characters')
    .optional()
    .default('(No context provided)'),
  chatHistory: z
    .array(
      z
        .string()
        .max(1000, 'Each chat history message must not exceed 1000 characters'),
    )
    .max(50, 'Chat history must not exceed 50 messages')
    .optional()
    .default([]),
});

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid('User ID must be a valid UUID'),
  email: z.string().email('Invalid email format'),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  iat: z.number().int().positive('Issued at must be a positive integer'),
  exp: z.number().int().positive('Expiration must be a positive integer'),
  aud: z.string().min(1, 'Audience is required').optional(),
  iss: z.string().min(1, 'Issuer is required').optional(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
    ),
});

export const RegisterRequestSchema = z
  .object({
    email: z.string().email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
      ),
    confirmPassword: z.string(),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(50, 'First name must not exceed 50 characters')
      .trim(),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(50, 'Last name must not exceed 50 characters')
      .trim(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const PasswordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const PasswordResetSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const TokenValidationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  source: z.enum(['header', 'auth', 'query']).optional(),
});

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['user', 'admin', 'moderator']),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional(),
  isActive: z.boolean().default(true),
});

export const AuthResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: UserProfileSchema.optional(),
  token: z.string().optional(),
  expiresIn: z.number().optional(),
});

export type UserInput = z.infer<typeof UserInputSchema>;
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordReset = z.infer<typeof PasswordResetSchema>;
export type TokenValidation = z.infer<typeof TokenValidationSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
