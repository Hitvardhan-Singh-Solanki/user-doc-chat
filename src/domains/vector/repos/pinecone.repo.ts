import { Pinecone } from '@pinecone-database/pinecone';

/**
 * Factory function to create a Pinecone client with proper validation
 * @param apiKey - Optional API key. If not provided, will use PINECONE_API_KEY environment variable
 * @returns Configured Pinecone client instance
 * @throws Error if API key is missing or empty
 */
export function createPineconeClient(apiKey?: string): Pinecone {
  const key = apiKey || process.env.PINECONE_API_KEY;

  if (!key || key.trim() === '') {
    throw new Error('PINECONE_API_KEY environment variable is required');
  }

  return new Pinecone({
    apiKey: key,
  });
}

// Default instance created using the factory function
export const pinecone = createPineconeClient();
