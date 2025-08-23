import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";

// Sanitize text content
function sanitizeText(content: string): string {
  return content.replace(/[\x00-\x1F\x7F]/g, "");
}

// Sanitize PDF content
async function sanitizePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

// Sanitize DOCX content
async function sanitizeDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Determine file type and sanitize
export async function sanitizeFile(buffer: Buffer): Promise<string> {
  const type = await fileTypeFromBuffer(buffer);

  if (!type) throw new Error("Unable to determine file type");

  switch (type.mime) {
    case "application/pdf":
      return sanitizePdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return sanitizeDocx(buffer);
    case "text/plain":
      return sanitizeText(buffer.toString("utf-8"));
    default:
      throw new Error(`Unsupported file type: ${type.mime}`);
  }
}
