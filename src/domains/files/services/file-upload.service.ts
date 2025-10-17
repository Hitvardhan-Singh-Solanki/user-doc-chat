import { uploadFileToMinio } from '@storage/providers/minio.provider';
import type {
  FileJob,
  MulterFile,
  UserFileRecord,
  AcceptedMimeType,
} from '@shared/types';
import { fileQueueName, queueAdapter } from '@queue/providers/bullmq.provider';
import { v4 as uuid } from 'uuid';
import createHttpError from 'http-errors';
import { IDBStore } from '@interfaces/db-store.interface';
import { logger } from '@config/logger.config';
import { config } from '@config';
import pino from 'pino';

const acceptedMimeTypes: AcceptedMimeType[] = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export class FileUploadService {
  private db: IDBStore;
  private log = logger.child({ component: 'FileUploadService' });

  constructor(dbStore: IDBStore) {
    this.db = dbStore;
  }

  /**
   * Verifies that a user has access to a specific file
   * @param userId The user ID to check
   * @param fileId The file ID to verify access for
   * @returns Promise<boolean> True if user has access, false otherwise
   */
  public async verifyFileAccess(
    userId: string,
    fileId: string,
  ): Promise<boolean> {
    const log = this.log.child({ userId, fileId });
    log.info('Verifying file access permissions');

    try {
      const result = await this.db.query<{ owner_id: string }>(
        'SELECT owner_id FROM user_files WHERE id = $1',
        [fileId],
      );

      if (result.rows.length === 0) {
        log.warn('File not found');
        return false;
      }

      const fileOwnerId = result.rows[0].owner_id;
      const hasAccess = fileOwnerId === userId;

      log.info(
        { hasAccess, fileOwnerId },
        'File access verification completed',
      );
      return hasAccess;
    } catch (error) {
      log.error(
        { err: (error as Error).message, stack: (error as Error).stack },
        'Error occurred during file access verification',
      );
      throw createHttpError({
        status: 500,
        message: 'Failed to verify file access',
      });
    }
  }

  public async upload(file: MulterFile, userId: string) {
    const log = this.log.child({ userId, originalname: file.originalname });
    log.info('Starting file upload process');

    try {
      this.validateFileBuffer(file, log);
      this.validateFileSize(file, log);

      const finalMimeType = await this.detectFileType(file, log);
      this.validateMimeType(finalMimeType, file.mimetype, log);

      const sanitizedName = await this.sanitizeFileName(file.originalname, log);
      const { fileRecord, key } = await this.uploadAndStoreFile(
        file,
        sanitizedName,
        userId,
        log,
      );
      await this.queueFileProcessing({ ...fileRecord, key }, log);

      log.info(
        { fileId: fileRecord.id },
        'File upload and queueing process completed successfully',
      );
      return fileRecord;
    } catch (error) {
      return this.handleUploadError(error, log);
    }
  }

  private validateFileBuffer(file: MulterFile, log: pino.Logger) {
    if (!file?.buffer || file.buffer.length === 0) {
      log.warn('File buffer is empty or missing');
      throw createHttpError({
        status: 400,
        message: 'No file content uploaded',
      });
    }
  }

  private validateFileSize(file: MulterFile, log: pino.Logger) {
    const MAX_FILE_SIZE = config.MAX_FILE_SIZE;
    if (file.size > MAX_FILE_SIZE) {
      log.warn({ size: file.size, maxSize: MAX_FILE_SIZE }, 'File too large');
      throw createHttpError({
        status: 400,
        message: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
      });
    }
  }

  private async detectFileType(
    file: MulterFile,
    log: pino.Logger,
  ): Promise<string> {
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer!);

    if (detected) {
      if (detected.mime !== file.mimetype) {
        log.warn(
          { detected: detected.mime, claimed: file.mimetype },
          'Mimetype mismatch detected - using detected type for security',
        );
      }
      return detected.mime;
    }

    if (acceptedMimeTypes.includes(file.mimetype as AcceptedMimeType)) {
      log.warn(
        { claimedMime: file.mimetype },
        'File signature detection inconclusive - falling back to declared MIME type',
      );
      return file.mimetype;
    }

    log.warn(
      { claimedMime: file.mimetype },
      'File signature detection inconclusive - rejecting upload for security',
    );
    throw createHttpError({
      status: 400,
      message: 'Unable to verify file type. File signature detection failed.',
    });
  }

  private validateMimeType(
    finalMimeType: string,
    claimedMime: string,
    log: pino.Logger,
  ) {
    if (!acceptedMimeTypes.includes(finalMimeType as AcceptedMimeType)) {
      log.warn({ finalMimeType, claimedMime }, 'Unsupported file type');
      throw createHttpError({
        status: 400,
        message: `File type ${finalMimeType} not supported`,
      });
    }

    log.info({ mime: finalMimeType }, 'File type and size are valid');
  }

  private async sanitizeFileName(
    originalname: string,
    log: pino.Logger,
  ): Promise<string> {
    const { withRegexTimeout } = await import('@shared/utils/regex-timeout');

    // Step 1: Replace invalid characters (safe regex)
    let sanitizedName = String(originalname || '').replace(
      /[^a-zA-Z0-9.-]/g,
      '_',
    );

    // Step 2: Replace multiple consecutive dots with single dot (protected with timeout)
    sanitizedName = await withRegexTimeout(
      /\.{2,}/g,
      sanitizedName,
      (regex, text) => text.replace(regex, '.'),
      1000, // 1 second timeout
    );

    // Step 3: Remove leading and trailing dots (protected with timeout)
    sanitizedName = await withRegexTimeout(
      /^\.+|\.+$/g,
      sanitizedName,
      (regex, text) => text.replace(regex, ''),
      1000, // 1 second timeout
    );

    // Step 4: Limit length
    sanitizedName = sanitizedName.substring(0, 255);

    if (!sanitizedName) {
      log.warn('Filename became empty after sanitization');
      throw createHttpError({
        status: 400,
        message: 'Invalid filename',
      });
    }

    return sanitizedName;
  }

  private async uploadAndStoreFile(
    file: MulterFile,
    sanitizedName: string,
    userId: string,
    log: pino.Logger,
  ): Promise<{ fileRecord: UserFileRecord; key: string }> {
    const encodedName = encodeURIComponent(sanitizedName);
    const key = `user-uploads/${userId}/${uuid()}-${encodedName}`;

    log.info({ key }, 'Uploading file to MinIO');
    await uploadFileToMinio(key, file.buffer!);
    log.info('File successfully uploaded to MinIO');

    log.info('Inserting file record into database');
    const result = await this.db.query<UserFileRecord>(
      `
                INSERT INTO user_files (file_name, file_size, owner_id, status)
                VALUES ($1, $2, $3, $4)
                RETURNING id, file_name, file_size, owner_id, status, created_at, updated_at
            `,
      [sanitizedName, file.size, userId, 'uploaded'],
    );

    const fileRecord = result.rows[0];
    log.info({ fileId: fileRecord.id }, 'File record created in database');

    return { fileRecord, key };
  }

  private async queueFileProcessing(
    fileRecord: UserFileRecord & { key: string },
    log: pino.Logger,
  ) {
    const job: FileJob = {
      key: fileRecord.key,
      userId: fileRecord.owner_id,
      fileId: fileRecord.id,
    };
    log.info(
      { jobId: job.key, fileId: job.fileId },
      'Adding job to BullMQ queue',
    );

    try {
      await queueAdapter.enqueue(fileQueueName, 'process-file', job);
    } catch (e) {
      await this.handleQueueFailure(e as Error, fileRecord.id, log);
    }
  }

  private async handleQueueFailure(
    queueError: Error,
    fileId: string,
    log: pino.Logger,
  ) {
    log.error(
      { fileId, err: queueError.message },
      'Failed to add job to queue. Updating database status.',
    );

    try {
      await this.db.query(
        `UPDATE user_files
                 SET status = $1,
                     error_message = $2
                 WHERE id = $3`,
        ['failed', queueError.message, fileId],
      );
    } catch (dbError) {
      const dbErr = dbError as Error;
      log.error(
        {
          fileId,
          queueError: queueError.message,
          dbError: dbErr.message,
          queueErrorStack: queueError.stack,
          dbErrorStack: dbErr.stack,
        },
        'Failed to update database status after queue failure. Both queue and database operations failed.',
      );
      (queueError as Error & { dbError?: Error }).dbError = dbErr;
    }

    throw queueError;
  }

  private handleUploadError(error: unknown, log: pino.Logger): never {
    if (error instanceof createHttpError.HttpError) {
      log.warn(
        { status: error.status, message: error.message },
        'File upload failed with an HTTP error',
      );
      throw error;
    }
    log.error(
      { err: (error as Error).message, stack: (error as Error).stack },
      'An unexpected error occurred during file upload',
    );
    throw createHttpError({ status: 500, message: 'File upload failed' });
  }
}
