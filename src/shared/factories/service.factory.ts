import { Application } from 'express';
import { PostgresService } from '@database/repositories/postgres.repository';
import { LLMService } from '@chat/services/llm.service';
import { VectorStoreService } from '@vector/services/vector-store.service';
import { FetchHTMLService } from '@chat/services/fetch.service';
import { DeepResearchService } from '@chat/services/deep-research.service';
import { WebsocketService } from '@chat/services/websocket.service';
import { config } from '@config';

export class ServiceFactory {
  private static instance: ServiceFactory;
  private services: Map<string, unknown> = new Map();

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  getService<T>(name: string, factory: () => T): T {
    if (!this.services.has(name)) {
      this.services.set(name, factory());
    }
    return this.services.get(name) as T;
  }

  getDatabase() {
    return this.getService('database', () => PostgresService.getInstance());
  }

  getLLMService() {
    return this.getService('llm', () => new LLMService());
  }

  getVectorStoreService() {
    return this.getService('vectorStore', () => {
      const llmService = this.getLLMService();
      return new VectorStoreService(llmService, config.VECTOR_STORE_PROVIDER);
    });
  }

  getFetchHTMLService() {
    return this.getService('fetchHTML', () => new FetchHTMLService());
  }

  getDeepResearchService() {
    return this.getService('deepResearch', () => {
      const llmService = this.getLLMService();
      return new DeepResearchService(llmService);
    });
  }

  getWebsocketService(app: Application) {
    return this.getService('websocket', () => {
      const db = this.getDatabase();
      const llmService = this.getLLMService();
      const vectorStoreService = this.getVectorStoreService();
      const fetchHTMLService = this.getFetchHTMLService();
      const deepResearchService = this.getDeepResearchService();

      return new WebsocketService(
        app,
        llmService,
        vectorStoreService,
        db,
        fetchHTMLService,
        deepResearchService,
      );
    });
  }

  // Clear all services (useful for testing)
  clear() {
    this.services.clear();
  }
}

export const serviceFactory = ServiceFactory.getInstance();
