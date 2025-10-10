export interface Secrets {
  // JWT
  jwtSecret: string;
  jwtAudience: string;
  jwtIssuer: string;

  // AI/LLM
  huggingfaceToken: string;

  // Vector Store
  pineconeApiKey: string;

  // MinIO/S3
  minioAccessKey: string;
  minioSecretKey: string;

  // Database
  postgresPassword: string;
  redisPassword?: string;

  // Sanitizer Service
  sanitizerHost?: string;
  sanitizerTimeout?: number;
}
