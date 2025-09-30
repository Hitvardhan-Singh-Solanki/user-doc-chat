import { AutoTokenizer } from '@xenova/transformers';
import { ITokenizer } from '../interfaces/tokenizer.interface';

export class XenovaTokenizerAdapter implements ITokenizer {
  private tokenizer: any;

  constructor(private modelName: string) {}

  public async init() {
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
  }

  encode(text: string): number[] {
    if (!this.tokenizer) throw new Error('Tokenizer not initialized');
    return this.tokenizer.encode(text);
  }

  decode(tokens: number[]): string {
    if (!this.tokenizer) throw new Error('Tokenizer not initialized');
    return this.tokenizer.decode(tokens);
  }

  countTokens(text: string): number {
    return this.encode(text).length;
  }
}
