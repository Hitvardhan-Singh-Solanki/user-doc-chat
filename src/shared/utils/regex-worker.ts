/**
 * Worker-based regex execution with hard timeout protection
 * Prevents ReDoS attacks by running regex operations in isolated workers
 */

import { parentPort } from 'worker_threads';
// import { RegexTimeoutError } from './regex-timeout';

interface RegexWorkerData {
  operation: 'test' | 'match' | 'replace' | 'exec';
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
  maxIterations?: number;
}

interface RegexWorkerResult {
  success: boolean;
  result?: string | RegExpExecArray | RegExpExecArray[] | null;
  error?: string;
}

/**
 * Worker thread handler for regex operations
 */
if (parentPort) {
  parentPort.on('message', (data: RegexWorkerData) => {
    try {
      const regex = new RegExp(data.pattern, data.flags);
      const result = executeRegexOperation(regex, data);

      parentPort!.postMessage({
        success: true,
        result,
      } as RegexWorkerResult);
    } catch (error) {
      parentPort!.postMessage({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } as RegexWorkerResult);
    }
  });
}

function executeRegexOperation(
  regex: RegExp,
  data: RegexWorkerData,
):
  | string
  | RegExpExecArray
  | RegExpExecArray[]
  | RegExpMatchArray
  | boolean
  | null {
  switch (data.operation) {
    case 'test':
      return regex.test(data.text);
    case 'match':
      return data.text.match(regex);
    case 'replace':
      return data.text.replace(regex, data.replacement || '');
    case 'exec':
      return executeRegexExec(regex, data.text, data.maxIterations || 1000);
    default:
      throw new Error(`Unknown operation: ${data.operation}`);
  }
}

function executeRegexExec(
  regex: RegExp,
  text: string,
  maxIterations: number,
): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  let iterations = 0;

  while ((match = regex.exec(text)) !== null && iterations < maxIterations) {
    results.push(match);
    iterations++;

    // Prevent infinite loop on zero-width matches
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  return results;
}
