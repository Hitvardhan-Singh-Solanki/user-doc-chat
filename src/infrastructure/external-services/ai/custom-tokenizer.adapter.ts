import { ITokenizer } from '../../../shared/interfaces/tokenizer.interface';

export class SimpleTokenizerAdapter implements ITokenizer {
  encode(text: string): number[] {
    const tokens = text.match(/\w+|[^\s\w]/g) || [];
    return tokens.map((_, i) => i);
  }

  decode(tokens: number[]): string {
    return '';
  }

  countTokens(text: string): number {
    return this.encode(text).length;
  }
}
