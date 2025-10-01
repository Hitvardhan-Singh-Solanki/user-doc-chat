/**
 * Safely parses a string value to a positive integer with fallback
 * @param value - The string value to parse
 * @param fallback - The fallback value to return if parsing fails or result is invalid
 * @returns A positive integer or the fallback value
 */
export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const parsed = parseInt(value, 10);

  // Check if parsing was successful and result is a positive integer
  if (isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
