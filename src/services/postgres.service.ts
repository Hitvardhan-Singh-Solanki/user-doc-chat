import { QueryResult } from "pg";
import { db } from "../repos/db.repo";
import { IDBStore } from "../interfaces/db-store.interface";
import { Vector } from "../types";
import { IVectorStore } from "../interfaces/vector-store.interface";

export class PostgresService implements IDBStore, IVectorStore {
  private static instance: PostgresService;
  private pool: any;

  private constructor() {
    this.pool = db;
  }

  public static getInstance(): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService();
    }
    return PostgresService.instance;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }> {
    const result: QueryResult = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }

  async upsertVectors(vectors: Vector[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const v of vectors) {
        await client.query(
          `INSERT INTO vectors(id, embedding, metadata)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET embedding = $2, metadata = $3`,
          [v.id, v.values, v.metadata]
        );
      }
      await client.query("COMMIT");
      return { upsertedCount: vectors.length };
    } catch (e) {
      try {
        await client.query("ROLLBACK");
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
    topK = 5
  ) {
    const { rows } = await this.pool.query(
      `SELECT *, embedding <-> $1 AS distance
       FROM vectors
       WHERE metadata->>'userId' = $2
         AND metadata->>'fileId' = $3
       ORDER BY embedding <-> $1
       LIMIT $4`,
      [embedding, userId, fileId, topK]
    );
    return { matches: rows };
  }

  async withTransaction<R>(fn: (tx: IDBStore) => Promise<R>): Promise<R> {
    // TODO: Not using this function right now.
    // TODO: Need to impletment this method
    return new Promise((res) => res);
  }
}
