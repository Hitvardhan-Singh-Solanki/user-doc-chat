export interface IDBStore {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}
