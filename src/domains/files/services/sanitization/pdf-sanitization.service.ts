import { ISanitizeFile } from '../../../../shared/interfaces/sanitize-file.interface';
import { sanitizeFileGrpc } from './sanitizer-client.service';

export class PDFSanitizationService implements ISanitizeFile {
  async sanitize(fileBuffer: Buffer): Promise<string> {
    if (
      !fileBuffer ||
      !Buffer.isBuffer(fileBuffer) ||
      fileBuffer.length === 0
    ) {
      throw new Error('fileBuffer is required and must be a non-empty Buffer');
    }

    const content = fileBuffer.toString('base64');
    if (!content) throw new Error('File content is empty');

    return sanitizeFileGrpc(content, 'application/pdf');
  }
}
