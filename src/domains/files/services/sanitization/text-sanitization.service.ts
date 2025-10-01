/* eslint-disable no-control-regex */
import createHttpError from 'http-errors';
import { ISanitizeFile } from '../../../../shared/interfaces/sanitize-file.interface';

export class TextSanitizationService implements ISanitizeFile {
  private CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  private UNICODE_INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;

  async sanitize(fileBuffer: Buffer): Promise<string> {
    let content: string;

    try {
      // Attempt to decode using strict UTF-8 decoder
      content = fileBuffer.toString('utf-8');

      // Check for Unicode replacement characters which indicate decoding issues
      if (content.includes('\uFFFD')) {
        throw new Error(
          'File contains invalid UTF-8 sequences that could not be decoded properly',
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown UTF-8 decoding error';
      throw createHttpError(
        400,
        `Failed to decode file content as UTF-8: ${errorMessage}`,
      );
    }

    content = content.replace(/^\uFEFF/, '');

    content = content.replace(this.CONTROL_CHARS, '');

    content = content.replace(this.UNICODE_INVISIBLES, '');

    content = content.replace(/\r\n/g, '\n');

    content = content.replace(/\n{3,}/g, '\n\n');

    return content.trim();
  }
}
