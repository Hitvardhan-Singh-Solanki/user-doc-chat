/**
 * File-related types and interfaces
 */

export interface FileJob {
  key: string;
  userId: string;
  fileId: string;
}

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

export interface UserFileRecord {
  id: string;
  file_name: string;
  file_size: string;
  owner_id: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  error_message?: string | null;
  processing_started_at?: string | null;
  processing_finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileUploadResult {
  id: string;
  file_name: string;
  file_size: string;
  owner_id: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  error_message?: string | null;
  processing_started_at?: string | null;
  processing_finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileAccessVerification {
  hasAccess: boolean;
  fileOwnerId: string;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export interface FileTypeDetection {
  mimeType: string;
  confidence: number;
}

export interface FileSanitizationResult {
  sanitizedName: string;
  originalName: string;
}

export interface FileUploadOptions {
  maxSize: number;
  allowedMimeTypes: string[];
  sanitizeFileName: boolean;
}

export interface FileProcessingJob {
  fileId: string;
  userId: string;
  key: string;
  mimeType: string;
  size: number;
}

export type AcceptedMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type FileStatus = 'uploaded' | 'processing' | 'processed' | 'failed';
