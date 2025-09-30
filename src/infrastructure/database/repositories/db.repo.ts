import { Pool } from 'pg';

const { DATABASE_URL, PG_SSL } = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
