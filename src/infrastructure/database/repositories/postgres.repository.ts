import { QueryResult } from 'pg';
import { db } from './db.repo';
import { IDBStore } from '../../../shared/interfaces/db-store.interface';
import { Vector } from '../../../shared/types';
import {
  IVectorStore,
  VectorQueryResult,
  QueryMatch,
} from '../../../shared/interfaces/vector-store.interface';

export class PostgresService implements IDBStore, IVectorStore {
  private static instance: PostgresService;
  private pool: typeof db;
  private distanceOperator: string;

  private constructor() {
    this.pool = db;
    // Default to cosine distance if not specified
    this.distanceOperator = process.env.VECTOR_DISTANCE_OPERATOR || 'cosine';
  }

  public static getInstance(): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService();
    }
    return PostgresService.instance;
  }

  /**
   * Get the appropriate SQL distance operator based on configuration
   */
  private getDistanceOperator(): string {
    switch (this.distanceOperator) {
      case 'euclidean':
        return '<#>';
      case 'inner_product':
        return '<#>';
      case 'cosine':
      default:
        return '<->';
    }
  }

  /**
   * Convert distance to similarity score based on the distance operator
   */
  private distanceToScore(distance: number): number {
    switch (this.distanceOperator) {
      case 'cosine':
        // Cosine distance ranges from [0,2] where 0=identical, 2=opposite
        // Normalize to [0,1] similarity score: 1 - (distance / 2)
        return 1 - distance / 2;
      case 'euclidean':
        // Euclidean distance is unbounded, use bounded transform: 1 / (1 + distance)
        return 1 / (1 + distance);
      case 'inner_product':
        // Inner product returns negative values, higher (less negative) is better
        // Return negative distance as score (since we want higher scores for better matches)
        return -distance;
      default:
        // Fallback to cosine normalization
        return 1 - distance / 2;
    }
  }

  async query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }> {
    const result: QueryResult = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }

  async upsertVectors(vectors: Vector[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Batch all vector upserts into a single query for better performance
      const values = vectors
        .map((v, idx) => {
          const base = idx * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(',');
      const params = vectors.flatMap((v) => [v.id, v.values, v.metadata]);
      await client.query(
        `INSERT INTO vectors(id, embedding, metadata)
         VALUES ${values}
         ON CONFLICT (id) DO UPDATE SET 
           embedding = EXCLUDED.embedding,
           metadata  = EXCLUDED.metadata`,
        params,
      );
      await client.query('COMMIT');
      return { upsertedCount: vectors.length };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async queryVector(
    embedding: number[],
    userId: string,
    fileId: string,
    topK = 5,
  ): Promise<VectorQueryResult> {
    // Input validation
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding array cannot be empty');
    }

    const topKInt = Math.floor(Number(topK));
    if (topKInt <= 0 || !Number.isInteger(topKInt)) {
      throw new Error('topK must be a positive integer');
    }

    const distanceOp = this.getDistanceOperator();
    const { rows } = await this.pool.query(
      `SELECT *, embedding ${distanceOp} $1 AS distance
       FROM vectors
       WHERE metadata->>'userId' = $2
         AND metadata->>'fileId' = $3
       ORDER BY distance
       LIMIT $4`,
      [embedding, userId, fileId, topKInt],
    );

    // Transform PostgreSQL result to our standardized format
    const matches: QueryMatch[] = rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      score: this.distanceToScore(row.distance as number),
      metadata: row.metadata || {},
      embedding: row.embedding as number[],
    }));

    return { matches };
  }

  async withTransaction<R>(fn: (tx: IDBStore) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create a transaction-scoped IDBStore instance
      const txStore: IDBStore = {
        query: async <T = unknown>(
          sql: string,
          params?: unknown[],
        ): Promise<{ rows: T[] }> => {
          const result: QueryResult = await client.query(sql, params);
          return { rows: result.rows as T[] };
        },
        withTransaction: async <R>(
          _txFn: (tx: IDBStore) => Promise<R>,
        ): Promise<R> => {
          // Nested transactions are not supported in this implementation
          throw new Error('Nested transactions are not supported');
        },
      };

      const result = await fn(txStore);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Log rollback error but don't mask the original error
        // Using console.error here is intentional for critical transaction failures
        // eslint-disable-next-line no-console
        console.error('Transaction rollback failed:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
