/**
 * Database-related types and interfaces
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeout?: number;
}

export interface DatabaseQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  command: string;
}

export interface DatabaseTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<DatabaseQueryResult<T>>;
}

export interface DatabaseConnection {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<DatabaseQueryResult<T>>;
  release(): void;
  begin(): Promise<DatabaseTransaction>;
}

export interface DatabasePool {
  connect(): Promise<DatabaseConnection>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface DatabaseHealthCheck {
  isHealthy: boolean;
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  connectionCount: number;
  maxConnections: number;
}

export interface DatabaseMetrics {
  queries: number;
  errors: number;
  averageQueryTime: number;
  activeConnections: number;
  totalConnections: number;
  slowQueries: number;
}

export interface DatabaseMigration {
  version: string;
  name: string;
  up: string;
  down: string;
  executedAt?: Date;
}

export interface DatabaseIndex {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  partial?: string;
}

export interface DatabaseConstraint {
  name: string;
  table: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check';
  columns: string[];
  references?: {
    table: string;
    columns: string[];
  };
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  indexes: DatabaseIndex[];
  constraints: DatabaseConstraint[];
  version: string;
}

export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  primaryKey?: string[];
  indexes: string[];
}

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: unknown;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface DatabaseBackup {
  id: string;
  timestamp: Date;
  size: number;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface DatabaseRestore {
  id: string;
  backupId: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface DatabaseOptimization {
  table: string;
  operation: 'vacuum' | 'analyze' | 'reindex';
  status: 'pending' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export type DatabaseDistanceOperator = 'cosine' | 'euclidean' | 'inner_product';
export type DatabaseConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error';
export type DatabaseTransactionStatus =
  | 'idle'
  | 'active'
  | 'committed'
  | 'aborted';
export type DatabaseBackupStatus = 'pending' | 'completed' | 'failed';
export type DatabaseOptimizationStatus = 'pending' | 'completed' | 'failed';
