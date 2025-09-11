import { PDFSanitizationService } from "./pdf-sanitization.service";
import { DocSanitizationService } from "./doc-sanitization.service";
import { TextSanitizationService } from "./text-sanitization.service";
import { ISanitizeFile } from "../../interfaces/sanitize-file.interface";

const sanitizerMap: Record<string, () => ISanitizeFile> = {
  "application/pdf": () => new PDFSanitizationService(),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    () => new DocSanitizationService(),
  "text/plain": () => new TextSanitizationService(),
};

export function getSanitizer(fileType: string): ISanitizeFile {
  const sanitizerFactory = sanitizerMap[fileType];
  if (!sanitizerFactory) {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
  return sanitizerFactory();
}
