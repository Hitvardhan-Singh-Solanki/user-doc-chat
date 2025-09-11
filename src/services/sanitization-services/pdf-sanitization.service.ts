import { ISanitizeFile } from "../../interfaces/sanitize-file.interface";
import { sanitizeFileGrpc } from "./sanitizer-client.service";

export class PDFSanitizationService implements ISanitizeFile {
  async sanitize(fileBuffer: Buffer): Promise<string> {
    const content = fileBuffer.toString("base64");
    if (!content) throw new Error("File content is empty");

    return sanitizeFileGrpc(content, "application/pdf");
  }
}
