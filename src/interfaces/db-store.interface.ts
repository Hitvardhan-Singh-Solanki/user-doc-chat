// src/interfaces/db-store.interface.ts

export interface IDBStore {
  query<T = unknown>(
    sql: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: T[]; rowCount?: number }>;

  // Optional: runs `fn` in a transaction, passing a transactional view of the store.
  withTransaction<R>(fn: (tx: IDBStore) => Promise<R>): Promise<R>;
}
