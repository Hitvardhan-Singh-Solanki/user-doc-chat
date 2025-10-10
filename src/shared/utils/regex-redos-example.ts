/**
 * Example demonstrating ReDoS protection
 * This file shows how the new regex timeout protection prevents ReDoS attacks
 */

import {
  safeRegexTest,
  safeRegexMatch,
  validateRegexPattern,
  isSafeRegexPattern,
} from './regex-timeout';

/**
 * Example of safe regex operations
 */
export async function demonstrateSafeRegex() {
  console.log('=== Safe Regex Operations ===');

  // Safe patterns
  const safePatterns = [/hello/, /world/, /\d+/, /[a-z]+/, /^start/, /end$/];

  for (const pattern of safePatterns) {
    try {
      const result = await safeRegexTest(pattern, 'hello world');
      console.log(`Pattern: ${pattern.source} - Result: ${result}`);
    } catch (error) {
      console.log(`Pattern: ${pattern.source} - Error: ${error}`);
    }
  }
}

/**
 * Example of unsafe regex patterns being rejected
 */
export async function demonstrateUnsafeRegex() {
  console.log('\n=== Unsafe Regex Patterns ===');

  const unsafePatterns = [
    '(a+)+', // Nested quantifiers
    '(a*)*', // Nested quantifiers
    '(a|a)*', // Exponential backtracking
    'a{1000}', // Excessive repetition
    '(?=a*)', // Dangerous lookahead
  ];

  for (const pattern of unsafePatterns) {
    try {
      console.log(`Testing pattern: ${pattern}`);
      console.log(`Is safe: ${isSafeRegexPattern(pattern)}`);

      // This should throw an error
      await safeRegexTest(new RegExp(pattern), 'hello');
    } catch (error) {
      console.log(
        `Pattern rejected: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Example of timeout protection
 */
export async function demonstrateTimeoutProtection() {
  console.log('\n=== Timeout Protection ===');

  // This pattern can cause catastrophic backtracking
  const dangerousPattern = '(a+)+$';
  const text = 'a'.repeat(100) + 'b';

  try {
    console.log(`Testing dangerous pattern: ${dangerousPattern}`);
    console.log(`Text length: ${text.length}`);

    const start = Date.now();
    const result = await safeRegexTest(new RegExp(dangerousPattern), text, 100);
    const duration = Date.now() - start;

    console.log(`Result: ${result} (timed out in ${duration}ms)`);
  } catch (error) {
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Run all examples
 */
export async function runExamples() {
  await demonstrateSafeRegex();
  await demonstrateUnsafeRegex();
  await demonstrateTimeoutProtection();
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
