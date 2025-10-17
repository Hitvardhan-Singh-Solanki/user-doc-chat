/**
 * Types for regex operations with timeout protection
 */

export interface RegexWorkerData {
  operation: 'test' | 'match' | 'replace' | 'exec';
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
  maxIterations?: number;
}

export interface RegexWorkerResult {
  success: boolean;
  result?: string | RegExpExecArray | RegExpExecArray[] | null;
  error?: string;
}
