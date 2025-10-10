import { ITokenizer } from '@interfaces/tokenizer.interface';

export class SimpleTokenizerAdapter implements ITokenizer {
  // Add vocabulary maps and ID counter to the class
  private readonly vocabulary = new Map<string, number>();
  private readonly reverseVocabulary = new Map<number, string>();
  private nextId = 0;

  encode(text: string): number[] {
    // Split text into tokens, preserving spaces as separate tokens
    const tokens = text.split(/(\s+)/).filter((token) => token.length > 0);
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
    return tokens
      .map((tokenId) => this.reverseVocabulary.get(tokenId) ?? '')
      .join('');
  }

  async countTokens(text: string): Promise<number> {
    return this.encode(text).length;
  }
}
