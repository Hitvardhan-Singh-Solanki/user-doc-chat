/**
 * Interface for file sanitization services that convert binary file content
 * into clean, readable text format suitable for processing and analysis.
 *
 * Sanitization involves:
 * - Converting binary files (PDF, DOC, etc.) to clean text/markdown format
 * - Removing control characters, invisible Unicode characters, and formatting artifacts
 * - Normalizing line endings and whitespace
 * - Ensuring UTF-8 encoding compliance
 * - Extracting and preserving meaningful content while removing potential security risks
 *
 * Supported file types:
 * - PDF files (converted to Markdown via gRPC service)
 * - Microsoft Word documents (.doc, .docx) (converted to Markdown)
 * - Plain text files (cleaned and normalized)
 *
 * The sanitized content is intended for use in:
 * - Document processing pipelines
 * - Text chunking and vector embedding
 * - Chat/AI processing systems
 * - Content analysis and search indexing
 */
export interface ISanitizeFile {
  /**
   * Sanitizes a file buffer by converting it to clean, readable text content.
   *
   * @param fileBuffer - The binary file content to sanitize
   * @returns Promise that resolves to sanitized text content in UTF-8 encoding
   *
   * **Return Value Details:**
   * - **Format**: UTF-8 encoded string
   * - **Content**: Clean, readable text typically in Markdown format
   * - **Encoding**: Always UTF-8, with control characters and invisible Unicode removed
   * - **Structure**: Normalized line endings (\n), collapsed multiple whitespace
   *
   * **Supported File Types:**
   * - `application/pdf` → Markdown text via gRPC service
   * - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → Markdown text
   * - `text/plain` → Cleaned UTF-8 text
   *
   * **Failure Behavior:**
   * - Throws `Error` for invalid input (null, empty, or non-Buffer)
   * - Throws `Error` for unsupported file types
   * - Throws `Error` for files that cannot be decoded (invalid UTF-8)
   * - Throws `Error` for files that are too large (>25MB limit)
   * - Throws `Error` for sanitization service failures
   * - **Never returns null, undefined, or empty string** - always throws on failure
   *
   * **Example Usage:**
   * ```typescript
   * const sanitizer = new PDFSanitizationService();
   * const cleanText = await sanitizer.sanitize(pdfBuffer);
   * // cleanText contains: "# Document Title\n\nClean markdown content..."
   * ```
   */
  sanitize(fileBuffer: Buffer): Promise<string>;
}
