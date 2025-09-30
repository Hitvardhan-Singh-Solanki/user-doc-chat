export interface ISanitizeFile {
  sanitize(fileBuffer: Buffer): Promise<string>;
}
