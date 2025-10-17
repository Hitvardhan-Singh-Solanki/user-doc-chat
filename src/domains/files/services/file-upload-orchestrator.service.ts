import type { FileJob, MulterFile, UserFileRecord } from '@shared/types';
import { v4 as uuid } from 'uuid';
import createHttpError from 'http-errors';
import { IDBStore } from '@interfaces/db-store.interface';
import { logger } from '@config/logger.config';
import { FileValidationService } from './file-validation.service';
import { FileStorageService } from './file-storage.service';
import { FileQueueService } from './file-queue.service';
import { FileAccessService } from './file-access.service';

export class FileUploadOrchestratorService {
  private db: IDBStore;
  private log = logger.child({ component: 'FileUploadOrchestratorService' }) as ReturnType<typeof logger.child>;
  private validationService: FileValidationService;
  private storageService: FileStorageService;
  private queueService: FileQueueService;
  private accessService: FileAccessService;

  constructor(dbStore: IDBStore) {
    this.db = dbStore;
    this.validationService = new FileValidationService();
    this.storageService = new FileStorageService();
    this.queueService = new FileQueueService();
    this.accessService = new FileAccessService(dbStore);
  }

  async verifyFileAccess(userId: string, fileId: string): Promise<boolean> {
    return this.accessService.verifyFileAccess(userId, fileId);
  }

  async upload(file: MulterFile, userId: string): Promise<UserFileRecord> {
    const log = this.log.child({ userId, originalname: file.originalname });
    log.info('Starting file upload process');

    try {
      this.validateFile(file, log);
      await this.detectFileType(file, log);
      const sanitizedName = await this.sanitizeFileName(file.originalname, log);

      const { fileRecord, key } = await this.uploadAndStoreFile(
        file,
        sanitizedName,
        userId,
        log,
      );

      await this.queueFileProcessing(
        {
          key,
          userId: fileRecord.owner_id,
          fileId: fileRecord.id,
        },
        log,
      );

      log.info(
        { fileId: fileRecord.id },
        'File upload and queueing process completed successfully',
      );
      return fileRecord;
    } catch (error) {
      return this.handleUploadError(error, log);
    }
  }

  private validateFile(
    file: MulterFile,
    log: ReturnType<typeof logger.child>,
  ): void {
    const bufferValidation = this.validationService.validateFileBuffer(file);
    if (!bufferValidation.isValid) {
      throw createHttpError({
        status: 400,
        message: bufferValidation.errors[0]?.message || 'Invalid file buffer',
      });
    }

    const sizeValidation = this.validationService.validateFileSize(file);
    if (!sizeValidation.isValid) {
      throw createHttpError({
        status: 400,
        message: sizeValidation.errors[0]?.message || 'File too large',
      });
    }

    log.debug('File validation passed');
  }

  private async detectFileType(
    file: MulterFile,
    log: ReturnType<typeof logger.child>,
  ): Promise<string> {
    const detectedMimeType = await this.validationService.detectFileType(file);

    const mimeValidation =
      this.validationService.validateMimeType(detectedMimeType);
    if (!mimeValidation.isValid) {
      throw createHttpError({
        status: 400,
        message: mimeValidation.errors[0]?.message || 'Unsupported file type',
      });
    }

    if (detectedMimeType !== file.mimetype) {
      log.warn(
        { detected: detectedMimeType, claimed: file.mimetype },
        'Mimetype mismatch detected - using detected type for security',
      );
    }

    return detectedMimeType;
  }

  private async sanitizeFileName(
    originalName: string,
    log: ReturnType<typeof logger.child>,
  ): Promise<string> {
    const sanitizedName = this.storageService.sanitizeFileName(originalName);
    log.debug({ originalName, sanitizedName }, 'File name sanitized');
    return sanitizedName;
  }

  private async uploadAndStoreFile(
    file: MulterFile,
    sanitizedName: string,
    userId: string,
    log: ReturnType<typeof logger.child>,
  ): Promise<{ fileRecord: UserFileRecord; key: string }> {
    const fileId = uuid();
    const key = `files/${userId}/${fileId}`;

    await this.storageService.uploadFile(key, file.buffer!);

    const fileRecord: UserFileRecord = {
      id: fileId,
      file_name: sanitizedName,
      file_size: file.size.toString(),
      owner_id: userId,
      status: 'uploaded',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.db.query(
      'INSERT INTO user_files (id, file_name, file_size, owner_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        fileRecord.id,
        fileRecord.file_name,
        fileRecord.file_size,
        fileRecord.owner_id,
        fileRecord.status,
        fileRecord.created_at,
        fileRecord.updated_at,
      ],
    );

    log.info({ fileId, key }, 'File uploaded and stored successfully');

    return { fileRecord, key };
  }

  private async queueFileProcessing(
    fileJob: FileJob & { key: string },
    log: ReturnType<typeof logger.child>,
  ): Promise<void> {
    await this.queueService.enqueueFileProcessing(fileJob);
    log.info(
      { fileId: fileJob.fileId, jobId: fileJob.key },
      'File processing queued successfully',
    );
  }

  private handleUploadError(
    error: unknown,
    log: ReturnType<typeof logger.child>,
  ): never {
    log.error(
      { err: (error as Error).message, stack: (error as Error).stack },
      'File upload failed',
    );

    if (error instanceof Error && error.message.includes('File type')) {
      throw createHttpError({
        status: 400,
        message: error.message,
      });
    }

    if (error instanceof Error && error.message.includes('File size')) {
      throw createHttpError({
        status: 413,
        message: error.message,
      });
    }

    throw createHttpError({
      status: 500,
      message: 'File upload failed',
    });
  }
}
