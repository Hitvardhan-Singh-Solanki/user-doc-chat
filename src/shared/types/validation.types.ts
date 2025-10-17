export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationFileValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  mimeType?: string;
  size?: number;
}

export interface FileValidationService {
  validateFileBuffer(file: ValidationMulterFile): ValidationResult;
  validateFileSize(file: ValidationMulterFile): ValidationResult;
  validateMimeType(mimeType: string): ValidationResult;
  detectFileType(file: ValidationMulterFile): Promise<string>;
}

export interface TextValidationService {
  validateInput(input: string, fieldName: string): ValidationResult;
  validatePromptConfig(config: ValidationPromptConfig): ValidationResult;
  validateQuestionPayload(payload: ValidationQuestionPayload): ValidationResult;
}

export interface ValidationConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  maxInputLength: number;
  minInputLength: number;
}

export interface ValidationMetrics {
  totalValidations: number;
  failedValidations: number;
  averageValidationTime: number;
  validationErrors: Record<string, number>;
}

export interface ValidationMulterFile {
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

export interface ValidationPromptConfig {
  version?: string;
  maxLength?: number;
  tone?: string;
  temperature?: number;
  truncateStrategy?: 'truncate-history' | 'truncate-context' | 'error';
  language?: string;
  jurisdiction?: string;
  logStats?: boolean;
  truncateBuffer?: number;
}

export interface ValidationQuestionPayload {
  fileId: string;
  question: string;
}
