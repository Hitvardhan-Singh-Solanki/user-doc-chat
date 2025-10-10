import { fileTypeFromBuffer } from 'file-type';
import { uploadFileToMinio } from '@storage/providers/minio.provider';
import { FileJob, MulterFile, UserFileRecord } from '@shared/types';
import { queueAdapter, fileQueueName } from '@queue/providers/bullmq.provider';
import { v4 as uuid } from 'uuid';
import createHttpError from 'http-errors';
import { IDBStore } from '@interfaces/db-store.interface';
import { logger } from '@config/logger.config';
import { config } from '@config';

const acceptedMimeTypes = [
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
    // 🔍 Create a child logger with request-specific context
    const log = this.log.child({ userId, originalname: file.originalname });
    log.info('Starting file upload process');

    try {
      // ✓ File buffer validation
      if (!file?.buffer || file.buffer.length === 0) {
        log.warn('File buffer is empty or missing');
        throw createHttpError({
          status: 400,
          message: 'No file content uploaded',
        });
      }

      const MAX_FILE_SIZE = config.MAX_FILE_SIZE;
      if (file.size > MAX_FILE_SIZE) {
        log.warn({ size: file.size, maxSize: MAX_FILE_SIZE }, 'File too large');
        throw createHttpError({
          status: 400,
          message: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
        });
      }

      const detected = await fileTypeFromBuffer(file.buffer!);
      let finalMimeType: string;

      if (detected) {
        // Signature detection succeeded - use detected MIME type
        finalMimeType = detected.mime;

        if (detected.mime !== file.mimetype) {
          log.warn(
            { detected: detected.mime, claimed: file.mimetype },
            'Mimetype mismatch detected - using detected type for security',
          );
        }
      } else {
        // Signature detection failed - reject upload for security
        log.warn(
          { claimedMime: file.mimetype },
          'File signature detection inconclusive - rejecting upload for security',
        );
        throw createHttpError({
          status: 400,
          message:
            'Unable to verify file type. File signature detection failed.',
        });
      }

      if (!acceptedMimeTypes.includes(finalMimeType)) {
        log.warn(
          { finalMimeType, claimedMime: file.mimetype },
          'Unsupported file type',
        );
        throw createHttpError({
          status: 400,
          message: `File type ${finalMimeType} not supported`,
        });
      }

      log.info(
        { mime: finalMimeType, size: file.size },
        'File type and size are valid',
      );

      const sanitizedName = String(file.originalname || '')
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
        .replace(/\.{2,}/g, '.') // Remove multiple consecutive dots
        .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
        .substring(0, 255); // Limit length

      if (!sanitizedName) {
        log.warn('Filename became empty after sanitization');
        throw createHttpError({
          status: 400,
          message: 'Invalid filename',
        });
      }

      // Percent-encode reserved characters for MinIO object key
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

      const job: FileJob = { key, userId, fileId: fileRecord.id };
      log.info(
        { jobId: job.key, fileId: job.fileId },
        'Adding job to BullMQ queue',
      );
      try {
        await queueAdapter.enqueue(fileQueueName, 'process-file', job);
      } catch (e) {
        const queueError = e as Error;
        log.error(
          { fileId: fileRecord.id, err: queueError.message },
          'Failed to add job to queue. Updating database status.',
        );

        try {
          await this.db.query(
            `UPDATE user_files SET status = $1, error_message = $2 WHERE id = $3`,
            ['failed', queueError.message, fileRecord.id],
          );
        } catch (dbError) {
          const dbErr = dbError as Error;
          log.error(
            {
              fileId: fileRecord.id,
              queueError: queueError.message,
              dbError: dbErr.message,
              queueErrorStack: queueError.stack,
              dbErrorStack: dbErr.stack,
            },
            'Failed to update database status after queue failure. Both queue and database operations failed.',
          );
          // Attach DB error as metadata to the original queue error
          (queueError as Error & { dbError?: Error }).dbError = dbErr;
        }

        throw queueError;
      }
      log.info(
        { fileId: fileRecord.id },
        'File upload and queueing process completed successfully',
      );
      return fileRecord;
    } catch (error) {
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
}
