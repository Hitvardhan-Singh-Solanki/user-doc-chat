export function SafeStringifyChunk(chunk: unknown): string {
  try {
    return typeof chunk === 'object' && chunk !== null
      ? JSON.stringify(chunk).substring(0, 1000)
      : String(chunk);
  } catch {
    return '[Unstringifiable object]';
  }
}
