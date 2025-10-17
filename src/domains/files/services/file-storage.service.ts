import { uploadFileToMinio } from '@storage/providers/minio.provider';
import { logger } from '@config/logger.config';

export class FileStorageService {
  private readonly log = logger.child({ component: 'FileStorageService' });

  async uploadFile(key: string, buffer: Buffer): Promise<void> {
    try {
      await uploadFileToMinio(key, buffer);
      this.log.debug({ key, size: buffer.length }, 'File uploaded to storage');
    } catch (error) {
      this.log.error({ error, key }, 'Failed to upload file to storage');
      throw error;
    }
  }

  sanitizeFileName(originalName: string): string {
    const sanitized = originalName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return sanitized || 'unnamed_file';
  }

  generateFileKey(userId: string, fileId: string): string {
    return `files/${userId}/${fileId}`;
  }
}
