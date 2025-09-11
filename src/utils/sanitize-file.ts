import { fileTypeFromBuffer } from "file-type";
import { getSanitizer } from "../services/sanitization-services/file-sanitizer.factory";

export async function sanitizeFile(fileBuffer: Buffer<ArrayBufferLike>) {
  const type = await fileTypeFromBuffer(fileBuffer);
  if (!type) throw new Error("Unable to determine file type");

  const sanitizationFactory = getSanitizer(type.mime);

  const sanitizedContent = sanitizationFactory.sanitize(fileBuffer);

  if (!sanitizedContent) {
    throw new Error("Sanitization resulted in empty content");
  }

  return sanitizedContent;
}
