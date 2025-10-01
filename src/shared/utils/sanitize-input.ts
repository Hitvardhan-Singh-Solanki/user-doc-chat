/**
 * Sanitizes user input to prevent prompt injection attacks
 * @param input - The raw user input to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized input safe for prompt interpolation
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Step 1: Trim whitespace and collapse consecutive spaces only
  let sanitized = input.trim().replace(/ {2,}/g, ' ');

  // Step 2: Remove control characters (except tab, newline, carriage return)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Step 3: Remove backticks that could break prompt structure
  sanitized = sanitized.replace(/`+/g, ' ');

  // Step 4: Escape embedded double quotes to prevent prompt injection
  sanitized = sanitized.replace(/"/g, '\\"');

  // Step 5: Truncate to safe maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }

  return sanitized;
}
