// One-shot migration runner.
// Usage: PGPASSWORD=... node scripts/run-migrations.mjs 078 079 080 081
// Uses session-mode pooler; runs each file in its own transaction.

import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const PROJECT_REF = 'ozcdsnpieeetzzwjqvjo';
const HOST = 'aws-0-us-west-2.pooler.supabase.com';
const USER = `postgres.${PROJECT_REF}`;
const DB = 'postgres';
const PORT = 5432;

const args = process.argv.slice(2);
if (args.length === 0) { console.error('need migration numbers'); process.exit(2); }

const password = process.env.PGPASSWORD;
if (!password) { console.error('PGPASSWORD env required'); process.exit(2); }

const client = new Client({
  host: HOST, port: PORT, user: USER, database: DB, password,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected');

for (const n of args) {
  const file = `supabase/migrations/${n}_${await findName(n)}`;
  const sql = readFileSync(file, 'utf8');
  console.log(`\n>>> Applying ${file}`);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`    OK`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`    FAILED: ${err.message}`);
    if (err.position) console.error(`    at character ${err.position}`);
    process.exit(1);
  }
}

await client.end();
console.log('\nAll migrations applied.');

async function findName(prefix) {
  const { readdirSync } = await import('node:fs');
  const match = readdirSync('supabase/migrations').find((f) => f.startsWith(prefix + '_') && f.endsWith('.sql'));
  if (!match) throw new Error(`No migration file for ${prefix}`);
  return match.slice(prefix.length + 1);
}
