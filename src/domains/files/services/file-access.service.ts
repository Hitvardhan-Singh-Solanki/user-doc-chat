import createHttpError from 'http-errors';
import { logger } from '@config/logger.config';
import { IDBStore } from '@interfaces/db-store.interface';

export class FileAccessService {
  private readonly db: IDBStore;
  private readonly log = logger.child({ component: 'FileAccessService' });

  constructor(dbStore: IDBStore) {
    this.db = dbStore;
  }

  async verifyFileAccess(userId: string, fileId: string): Promise<boolean> {
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

  async getUserFiles(
    userId: string,
  ): Promise<Array<{ id: string; file_name: string; status: string }>> {
    const log = this.log.child({ userId });
    log.info('Retrieving user files');

    try {
      const result = await this.db.query<{
        id: string;
        file_name: string;
        status: string;
      }>(
        'SELECT id, file_name, status FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC',
        [userId],
      );

      log.info({ fileCount: result.rows.length }, 'User files retrieved');
      return result.rows;
    } catch (error) {
      log.error(
        { err: (error as Error).message, stack: (error as Error).stack },
        'Error occurred while retrieving user files',
      );
      throw createHttpError({
        status: 500,
        message: 'Failed to retrieve user files',
      });
    }
  }
}
