import { ISearchAdapter } from '../../../shared/interfaces/search-adapter.interface';
import { SearchResult } from '../../../shared/types';

export class SearchService {
  private adapter: ISearchAdapter;

  constructor(adapter: ISearchAdapter) {
    this.adapter = adapter;
  }

  async search(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    return await this.adapter.search(query, maxResults);
  }
}
