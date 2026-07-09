import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '@/lib/logger';
import { SUPABASE_DB_CA_PEM } from '@/lib/db-ca';

if (!process.env.PG_HOST && process.env.NEXT_PHASE !== 'phase-production-build') {
  throw new Error('[db-pg] PG_HOST environment variable is required');
}

// Supabase's pooler presents a chain rooted at the self-signed "Supabase Root
// 2021 CA", which Node's default trust store rejects (SELF_SIGNED_CERT_IN_CHAIN).
// Trust that CA explicitly so we keep rejectUnauthorized:true (verify the chain,
// not disable validation). Env var is primary; the committed cert is the fallback.
// .trim() guards against a trailing newline in the env value (same class of bug
// that broke the realtime anon key). The env var is used ONLY if it looks like a
// real PEM, so a mangled multi-line env value can't silently break TLS — it
// falls back to the committed cert instead.
const envCa = process.env.SUPABASE_DB_CA?.trim();
const SUPABASE_CA = envCa && envCa.includes('BEGIN CERTIFICATE') ? envCa : SUPABASE_DB_CA_PEM;

const pool = new Pool({
  host: process.env.PG_HOST || '',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'ministry_dashboard',
  user: process.env.PG_USER || 'ministry_app',
  password: process.env.PG_PASSWORD,
  // Serverless functions share a pooler — keep low to avoid exhausting Supabase connection limits
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Enforce TLS certificate validation in production to prevent MITM attacks,
  // trusting the Supabase pooler CA (see SUPABASE_CA above).
  ssl: process.env.NODE_ENV === 'production' ? { ca: SUPABASE_CA, rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ query: text.substring(0, 80), duration, rowCount: result.rowCount }, 'DB query');
    }
    return result;
  } catch (error: unknown) {
    logger.error({ err: error, query: text.substring(0, 80) }, 'Query error');
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
