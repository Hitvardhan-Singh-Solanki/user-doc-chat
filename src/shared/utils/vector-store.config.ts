import { VectorStoreType } from '../types';
import pino from 'pino';

const logger = pino({ name: 'vector-store-config' });

/**
 * Supported vector store providers
 */
const SUPPORTED_PROVIDERS: VectorStoreType[] = ['pinecone', 'pgvector'];

/**
 * Default vector store provider
 */
const DEFAULT_PROVIDER: VectorStoreType = 'pinecone';

/**
 * Validates and returns the vector store provider from environment configuration
 * @returns The validated vector store provider
 * @throws Error if an unsupported provider is specified
 */
export function getVectorStoreProvider(): VectorStoreType {
  const provider = process.env.VECTOR_STORE_PROVIDER as VectorStoreType;

  // If no provider is specified or it's an empty string, return the default
  if (!provider || provider.trim() === '') {
    return DEFAULT_PROVIDER;
  }

  // Validate that the provider is supported
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported vector store provider: ${provider}. ` +
        `Supported providers are: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
  }

  return provider;
}

/**
 * Gets the vector store provider with logging for debugging
 * @returns The validated vector store provider
 */
export function getVectorStoreProviderWithLogging(): VectorStoreType {
  const provider = getVectorStoreProvider();

  // Log the provider being used (useful for debugging)
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`Using vector store provider: ${provider}`);
  }

  return provider;
}
