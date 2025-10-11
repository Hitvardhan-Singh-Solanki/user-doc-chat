import { ITokenizer } from '@interfaces/tokenizer.interface';

interface XenovaTokenizer {
  encode(text: string): number[];
  decode(tokens: number[]): string;
}

export class XenovaTokenizerAdapter implements ITokenizer {
  private tokenizer: XenovaTokenizer | null = null;

  constructor(private modelName: string) {}

  public async init() {
    const dynamicImport = new Function(
      'modulePath',
      'return import(modulePath)',
    );
    const module = await dynamicImport('@xenova/transformers');
    const AutoTokenizer = module.AutoTokenizer;
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
  }

  encode(text: string): number[] {
    if (!this.tokenizer) {
      throw new Error('Tokenizer not initialized. Call init() first.');
    }
    return this.tokenizer.encode(text);
  }

  decode(tokens: number[]): string {
    if (!this.tokenizer) {
      throw new Error('Tokenizer not initialized. Call init() first.');
    }
    return this.tokenizer.decode(tokens);
  }

  async countTokens(text: string): Promise<number> {
    return this.encode(text).length;
  }
}
