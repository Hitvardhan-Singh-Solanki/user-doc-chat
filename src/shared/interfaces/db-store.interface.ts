export interface IDBStore {
  query<T = unknown>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number }>;

  withTransaction<R>(fn: (tx: IDBStore) => Promise<R>): Promise<R>;
}
