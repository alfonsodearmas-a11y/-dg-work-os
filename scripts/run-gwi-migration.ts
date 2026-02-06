/**
 * Run GWI migration via Supabase pg-meta API
 * Usage: npx tsx scripts/run-gwi-migration.ts
 */

import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ozcdsnpieeetzzwjqvjo.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const sql = fs.readFileSync('database/gwi_tables_migration.sql', 'utf8');

// Split SQL into individual statements to run sequentially
const statements = sql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

async function runStatement(stmt: string, label: string) {
  const fullStmt = stmt.endsWith(';') ? stmt : stmt + ';';

  // Use the pg-meta query endpoint
  const res = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'x-connection-encrypted': 'false',
    },
    body: JSON.stringify({ query: fullStmt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }

  const result = await res.json();
  console.log(`  [OK] ${label}`);
  return result;
}

async function main() {
  console.log('Running GWI migration against Supabase...\n');

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const firstLine = stmt.split('\n').find(l => !l.startsWith('--') && l.trim())?.trim() || '';
    const label = firstLine.slice(0, 70) + (firstLine.length > 70 ? '...' : '');

    try {
      await runStatement(stmt, label);
    } catch (err: any) {
      console.error(`  [FAIL] ${label}`);
      console.error(`    ${err.message}`);
    }
  }

  // Verify
  console.log('\nVerifying...');
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'x-connection-encrypted': 'false',
      },
      body: JSON.stringify({
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'gwi_%' ORDER BY table_name;`
      }),
    });
    const tables = await verifyRes.json();
    console.log('GWI tables:', tables);

    const seedRes = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'x-connection-encrypted': 'false',
      },
      body: JSON.stringify({
        query: `SELECT report_month, report_type FROM gwi_monthly_reports;`
      }),
    });
    const seed = await seedRes.json();
    console.log('Seed data:', seed);
  } catch (err: any) {
    console.error('Verify failed:', err.message);
  }

  console.log('\nDone!');
}

main();
