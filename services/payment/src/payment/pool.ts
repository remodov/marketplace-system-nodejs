import { Pool } from 'pg';
import { ensureSchema } from './payment.repository';

export const POOL = Symbol('POOL');

const CONNECT_TIMEOUT_MS = 2000;

export async function connectAndEnsureSchema(databaseUrl: string): Promise<Pool> {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  try {
    await ensureSchema(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return pool;
}
