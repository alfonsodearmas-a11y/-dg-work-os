#!/usr/bin/env node
// Regenerate scripts/schema-snapshot.json from the LIVE prod database, so the
// drift guard checks against current reality. Connects via the same PG_* env the
// app uses (lib/db-pg). Run after an intentional (additive) schema change:
//   node scripts/refresh-schema-snapshot.mjs   (npm run refresh:schema-snapshot)
//
// Uses `pg` (already a dependency). Loads .env.local if present so it works locally.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env.local loader (no dotenv dependency).
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) { let v = m[2].trim(); if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1); if (!process.env[m[1]]) process.env[m[1]] = v.trim(); }
  }
}

const { Client } = pg;
const client = new Client({
  host: (process.env.PG_HOST || '').trim(),
  port: Number((process.env.PG_PORT || '5432').trim()),
  user: (process.env.PG_USER || '').trim(),
  password: (process.env.PG_PASSWORD || '').trim(),
  database: (process.env.PG_DATABASE || 'postgres').trim(),
  ssl: /supabase|pooler/.test(process.env.PG_HOST || '') ? { rejectUnauthorized: false } : undefined,
});

const columnsSql = `SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' ORDER BY table_name, ordinal_position`;
const fksSql = `SELECT tc.table_name AS src, kcu.column_name AS col, ccu.table_name AS ref, ccu.column_name AS refcol
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`;

await client.connect();
const cols = (await client.query(columnsSql)).rows;
const fks = (await client.query(fksSql)).rows;
await client.end();

const tables = {};
for (const { table_name, column_name } of cols) (tables[table_name] ||= []).push(column_name);
for (const t of Object.keys(tables)) tables[t].sort();

const out = {
  generated_note: 'Committed prod schema snapshot for check:drift. Refresh via: npm run refresh:schema-snapshot.',
  schema: 'public',
  tables: Object.fromEntries(Object.keys(tables).sort().map((t) => [t, tables[t]])),
  fks,
};
writeFileSync(join(ROOT, 'scripts/schema-snapshot.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`Wrote scripts/schema-snapshot.json — ${Object.keys(tables).length} tables, ${cols.length} columns, ${fks.length} FKs.`);
