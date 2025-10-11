import { Pinecone } from '@pinecone-database/pinecone';
import { secretsManager } from '@secrets';

/**
 * Factory function to create a Pinecone client with proper validation
 * @param apiKey - Optional API key. If not provided, will use PINECONE_API_KEY environment variable
 * @returns Configured Pinecone client instance
 * @throws Error if API key is missing or empty
 */
export function createPineconeClient(apiKey?: string): Pinecone {
  const key = apiKey || secretsManager.getPineconeApiKey();

  if (!key || key.trim() === '') {
    throw new Error(
      'Pinecone API key is required (provide via apiKey or secrets manager)',
    );
  }

  return new Pinecone({
    apiKey: key,
  });
}

let pineconeInstance: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeInstance) {
    pineconeInstance = createPineconeClient();
  }
  return pineconeInstance;
}

export { getPineconeClient as pinecone };
