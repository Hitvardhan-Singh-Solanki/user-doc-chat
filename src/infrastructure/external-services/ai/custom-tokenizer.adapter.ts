import { ITokenizer } from '../../../shared/interfaces/tokenizer.interface';

export class SimpleTokenizerAdapter implements ITokenizer {
  // Add vocabulary maps and ID counter to the class
  private readonly vocabulary = new Map<string, number>();
  private readonly reverseVocabulary = new Map<number, string>();
  private nextId = 0;

  encode(text: string): number[] {
    const tokens = text.match(/\w+|[^\s\w]/g) || [];
    return tokens.map((token) => {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.nextId);
        this.reverseVocabulary.set(this.nextId, token);
        this.nextId++;
      }
      return this.vocabulary.get(token)!;
    });
  }

  decode(tokens: number[]): string {
    return '';
  }

  countTokens(text: string): number {
    return this.encode(text).length;
  }
}
