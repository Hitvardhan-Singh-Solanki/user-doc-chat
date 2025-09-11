export interface ISanitizeFile {
  sanitize(fileBuffer: Buffer<ArrayBufferLike>): Promise<string>;
}
