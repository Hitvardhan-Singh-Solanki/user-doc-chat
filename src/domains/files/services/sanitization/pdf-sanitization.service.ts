import { ISanitizeFile } from '../../../../shared/interfaces/sanitize-file.interface';
import { sanitizeFileGrpcBuffer } from './sanitizer-client.service';

export class PDFSanitizationService implements ISanitizeFile {
  async sanitize(fileBuffer: Buffer): Promise<string> {
    if (
      !fileBuffer ||
      !Buffer.isBuffer(fileBuffer) ||
      fileBuffer.length === 0
    ) {
      throw new Error('fileBuffer is required and must be a non-empty Buffer');
    }

    return sanitizeFileGrpcBuffer(fileBuffer, 'application/pdf');
  }
}
