export interface ITokenizer {
  encode(text: string): number[];
  decode(tokens: number[]): string;
  countTokens(text: string): number;
}
