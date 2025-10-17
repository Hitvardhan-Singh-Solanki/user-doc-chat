/**
 * Types for AI/ML services
 */

export interface XenovaTokenizer {
  encode(text: string): number[];
  decode(tokens: number[]): string;
}
