/**
 * Email utility functions for consistent email handling across the application
 */

/**
 * Normalizes email by trimming whitespace and converting to lowercase
 * This ensures consistent email storage and comparison across the application
 * @param email - The email address to normalize
 * @returns The normalized email address
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase();
}

/**
 * Validates if an email address has a basic valid format
 * @param email - The email address to validate
 * @returns True if the email format is valid, false otherwise
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}
