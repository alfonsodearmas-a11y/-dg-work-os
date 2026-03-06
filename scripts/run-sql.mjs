import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'ozcdsnpieeetzzwjqvjo';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) { console.error('Set SUPABASE_ACCESS_TOKEN'); process.exit(1); }

async function runSQL(sql, label) {
  console.log(`\n--- ${label} ---`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) { const t = await res.text(); console.error(`  HTTP ${res.status}: ${t}`); return null; }
  const data = await res.json();
  console.log('  Result:', JSON.stringify(data)?.slice(0, 300));
  return data;
}

async function main() {
  const sql = readFileSync(resolve(__dirname, '..', process.argv[2]), 'utf-8');
  await runSQL(sql, process.argv[2]);
  console.log('\nDone.');
}
main().catch(console.error);
