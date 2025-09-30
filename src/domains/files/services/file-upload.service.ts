import { fileTypeFromBuffer } from 'file-type';
import { uploadFileToMinio } from '../../../infrastructure/storage/providers/minio.provider';
import { FileJob, MulterFile, UserFileRecord } from '../../../shared/types';
import { fileQueue } from '../../../infrastructure/database/repositories/bullmq.repo';
import { v4 as uuid } from 'uuid';
import createHttpError from 'http-errors';
import { IDBStore } from '../../../shared/interfaces/db-store.interface';
import { logger } from '../../../config/logger.config';

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

  public async upload(file: MulterFile, userId: string) {
    // 🔍 Create a child logger with request-specific context
    const log = this.log.child({ userId, originalname: file.originalname });
    log.info('Starting file upload process');

    try {
      if (!file?.buffer || file.buffer.length === 0) {
        log.warn('File buffer is empty or missing');
        throw createHttpError({
          status: 400,
          message: 'No file content uploaded',
        });
      }

      const detected = await fileTypeFromBuffer(file.buffer!);
      const mime = detected?.mime ?? file.mimetype;
      if (!mime || !acceptedMimeTypes.includes(mime)) {
        log.warn({ mime }, 'Unsupported file type detected');
        throw createHttpError({
          status: 400,
          message: 'Unsupported file type',
        });
      }
      log.info({ mime, size: file.size }, 'File type and size are valid');

      const safeName = String(file.originalname || '')
        // eslint-disable-next-line no-control-regex, no-useless-escape
        .replace(/[\/\\\u0000-\u001F]/g, '')
        .slice(0, 200);
      const key = `${uuid()}-${safeName}`;
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
        [file.originalname, file.size, userId, 'uploaded'],
      );
      const fileRecord = result.rows[0];
      log.info({ fileId: fileRecord.id }, 'File record created in database');

      const job: FileJob = { key, userId, fileId: fileRecord.id };
      log.info(
        { jobId: job.key, fileId: job.fileId },
        'Adding job to BullMQ queue',
      );
      try {
        await fileQueue.add('process-file', job);
      } catch (e) {
        log.error(
          { fileId: fileRecord.id, err: (e as Error).message },
          'Failed to add job to queue. Updating database status.',
        );
        await this.db.query(
          `UPDATE user_files SET status = $1, error_message = $2 WHERE id = $3`,
          ['failed', (e as Error).message, fileRecord.id],
        );
        throw e;
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
