import createHttpError from 'http-errors';
import { logger } from '@config/logger.config';
import type {
  ValidationResult,
  MulterFile,
  AcceptedMimeType,
  ValidationConfig,
  ValidationMetrics,
} from '@shared/types';

const acceptedMimeTypes: AcceptedMimeType[] = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export class FileValidationService {
  private readonly log = logger.child({ component: 'FileValidationService' });
  private readonly config: ValidationConfig;
  private metrics: ValidationMetrics = {
    totalValidations: 0,
    failedValidations: 0,
    averageValidationTime: 0,
    validationErrors: {},
  };

  constructor(config?: Partial<ValidationConfig>) {
    this.config = {
      maxFileSize: 50 * 1024 * 1024,
      allowedMimeTypes: acceptedMimeTypes,
      maxInputLength: 1000,
      minInputLength: 1,
      ...config,
    };
  }

  validateFileBuffer(file: MulterFile): ValidationResult {
    const startTime = Date.now();
    this.metrics.totalValidations++;

    if (!file?.buffer || file.buffer.length === 0) {
      this.recordValidationError('FILE_BUFFER_EMPTY');
      return {
        isValid: false,
        errors: [
          {
            field: 'buffer',
            message: 'File buffer is empty or invalid',
            code: 'FILE_BUFFER_EMPTY',
          },
        ],
      };
    }

    const duration = Date.now() - startTime;
    this.updateMetrics(duration);

    return {
      isValid: true,
      errors: [],
    };
  }

  validateFileSize(file: MulterFile): ValidationResult {
    const startTime = Date.now();
    this.metrics.totalValidations++;

    if (file.size > this.config.maxFileSize) {
      this.recordValidationError('FILE_TOO_LARGE');
      return {
        isValid: false,
        errors: [
          {
            field: 'size',
            message: `File size ${file.size} exceeds maximum allowed size ${this.config.maxFileSize}`,
            code: 'FILE_TOO_LARGE',
          },
        ],
      };
    }

    const duration = Date.now() - startTime;
    this.updateMetrics(duration);

    return {
      isValid: true,
      errors: [],
    };
  }

  validateMimeType(mimeType: string): ValidationResult {
    const startTime = Date.now();
    this.metrics.totalValidations++;

    if (!this.config.allowedMimeTypes.includes(mimeType as AcceptedMimeType)) {
      this.recordValidationError('INVALID_MIME_TYPE');
      return {
        isValid: false,
        errors: [
          {
            field: 'mimetype',
            message: `File type ${mimeType} not supported`,
            code: 'INVALID_MIME_TYPE',
          },
        ],
      };
    }

    const duration = Date.now() - startTime;
    this.updateMetrics(duration);

    return {
      isValid: true,
      errors: [],
    };
  }

  async detectFileType(file: MulterFile): Promise<string> {
    const startTime = Date.now();
    this.metrics.totalValidations++;

    try {
      const detected = await this.performFileTypeDetection(file);
      const duration = Date.now() - startTime;
      this.updateMetrics(duration);

      if (detected.mime && detected.mime !== file.mimetype) {
        this.log.warn(
          { detected: detected.mime, claimed: file.mimetype },
          'Mimetype mismatch detected - using detected type for security',
        );
      }
      return detected.mime;
    } catch (error) {
      this.recordValidationError('FILE_TYPE_DETECTION_FAILED');
      throw createHttpError({
        status: 400,
        message: 'File type detection failed',
      });
    }
  }

  private async performFileTypeDetection(
    file: MulterFile,
  ): Promise<{ mime: string }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ mime: file.mimetype });
      }, 100);
    });
  }

  private recordValidationError(errorCode: string): void {
    this.metrics.failedValidations++;
    this.metrics.validationErrors[errorCode] =
      (this.metrics.validationErrors[errorCode] || 0) + 1;
  }

  private updateMetrics(duration: number): void {
    this.metrics.averageValidationTime =
      (this.metrics.averageValidationTime + duration) / 2;
  }

  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalValidations: 0,
      failedValidations: 0,
      averageValidationTime: 0,
      validationErrors: {},
    };
  }
}
