import { z } from 'zod';

export const FileUploadSchema = z.object({
  file: z.object({
    fieldname: z.string(),
    originalname: z
      .string()
      .min(1, 'Original filename is required')
      .max(255, 'Filename must not exceed 255 characters'),
    encoding: z.string(),
    mimetype: z
      .string()
      .regex(
        /^(application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/,
        'Unsupported file type. Only PDF, TXT, and DOCX files are allowed',
      ),
    size: z
      .number()
      .int()
      .min(1, 'File size must be greater than 0')
      .max(50 * 1024 * 1024, 'File size must not exceed 50MB'),
    destination: z.string().optional(),
    filename: z.string().optional(),
    path: z.string().optional(),
    buffer: z.instanceof(Buffer).optional(),
  }),
  userId: z.string().uuid('User ID must be a valid UUID'),
});

export const FileValidationSchema = z.object({
  fileId: z.string().uuid('File ID must be a valid UUID'),
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name must not exceed 255 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'File name contains invalid characters'),
  fileSize: z
    .number()
    .int()
    .min(1, 'File size must be greater than 0')
    .max(50 * 1024 * 1024, 'File size must not exceed 50MB'),
  mimeType: z.enum([
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  status: z.enum(['uploaded', 'processing', 'processed', 'failed']),
});

export const FileAccessSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  fileId: z.string().uuid('File ID must be a valid UUID'),
  action: z.enum(['read', 'write', 'delete', 'share']),
  granted: z.boolean(),
  reason: z.string().optional(),
});

export const FileProcessingJobSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  userId: z.string().uuid(),
  key: z.string().min(1, 'Storage key is required'),
  mimeType: z.string(),
  size: z.number().int().positive(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0).max(3).default(0),
});

export const FileMetadataSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  ownerId: z.string().uuid(),
  status: z.enum(['uploaded', 'processing', 'processed', 'failed']),
  createdAt: z.date(),
  updatedAt: z.date(),
  processingStartedAt: z.date().optional(),
  processingFinishedAt: z.date().optional(),
  errorMessage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().max(500).optional(),
});

export const FileSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100),
  userId: z.string().uuid(),
  filters: z
    .object({
      mimeTypes: z.array(z.string()).optional(),
      dateRange: z
        .object({
          start: z.date().optional(),
          end: z.date().optional(),
        })
        .optional(),
      status: z
        .array(z.enum(['uploaded', 'processing', 'processed', 'failed']))
        .optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  pagination: z
    .object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    })
    .optional(),
});

export const FileShareSchema = z.object({
  fileId: z.string().uuid(),
  ownerId: z.string().uuid(),
  sharedWith: z.array(z.string().uuid()),
  permissions: z.array(z.enum(['read', 'write', 'delete'])),
  expiresAt: z.date().optional(),
  isPublic: z.boolean().default(false),
});

export const LowContentSchema = z
  .array(
    z.string().max(1000, 'Each content item must not exceed 1000 characters'),
  )
  .max(100, 'Content array must not exceed 100 items')
  .default([]);

export type FileUpload = z.infer<typeof FileUploadSchema>;
export type FileValidation = z.infer<typeof FileValidationSchema>;
export type FileAccess = z.infer<typeof FileAccessSchema>;
export type FileProcessingJob = z.infer<typeof FileProcessingJobSchema>;
export type FileMetadata = z.infer<typeof FileMetadataSchema>;
export type FileSearch = z.infer<typeof FileSearchSchema>;
export type FileShare = z.infer<typeof FileShareSchema>;
export type LowContent = z.infer<typeof LowContentSchema>;
