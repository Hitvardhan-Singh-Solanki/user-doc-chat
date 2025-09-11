import { ISanitizeFile } from "../../interfaces/sanitize-file.interface";

export class TextSanitizationService implements ISanitizeFile {
  private CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  private UNICODE_INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g;

  async sanitize(fileBuffer: Buffer): Promise<string> {
    let content = fileBuffer.toString("utf-8");

    content = content.replace(/^\uFEFF/, "");

    content = content.replace(this.CONTROL_CHARS, "");

    content = content.replace(this.UNICODE_INVISIBLES, "");

    content = content.replace(/\r\n/g, "\n");

    content = content.replace(/\n{3,}/g, "\n\n");

    return content.trim();
  }
}
