// One-time backfill: populate direct_outreach_cases.region from outreach_location.
//
// The durable region fix derives the canonical "Region N" at import time (see
// lib/direct-outreach/region.ts). Existing prod rows predate that and have a NULL
// region, so this backfill runs the SAME TypeScript extractor over each row's
// outreach_location and writes the result into the region column — no second SQL
// normalizer, one source of truth.
//
// Idempotent: only rows whose stored region differs from the derived value are
// written, so a second run reports 0 updated. Safe to re-run.
//
// Usage (from repo root, with the app's DB env available — .env.local is loaded
// automatically if present; a remote pooler needs SSL, so run with NODE_ENV=production):
//   NODE_ENV=production npx tsx scripts/backfill-direct-outreach-region.ts

import { existsSync, readFileSync } from 'node:fs';
import { extractOutreachRegion } from '../lib/direct-outreach/region';

// Load .env.local into process.env BEFORE importing db-pg (its Pool reads PG_*
// at module load). Existing env wins, so a deploy environment is untouched.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(idx + 1).trim();
  }
}

interface CaseRow {
  case_id: number;
  outreach_location: string | null;
  region: string | null;
}

async function main(): Promise<void> {
  const db = await import('../lib/db-pg'); // dynamic: needs PG_* env set above

  const { rows } = await db.query(
    'SELECT case_id, outreach_location, region FROM direct_outreach_cases',
  );

  const changes = (rows as CaseRow[])
    .map((r) => ({ case_id: r.case_id, current: r.region, derived: extractOutreachRegion(r.outreach_location) }))
    .filter((r) => r.derived !== r.current); // idempotent: skip already-aligned rows

  if (changes.length > 0) {
    await db.transaction(async (client) => {
      for (const c of changes) {
        await client.query('UPDATE direct_outreach_cases SET region = $1 WHERE case_id = $2', [
          c.derived,
          c.case_id,
        ]);
      }
    });
  }

  const withRegion = changes.filter((c) => c.derived !== null).length;
  console.log(
    `Backfill complete: updated ${changes.length} of ${rows.length} rows ` +
      `(${withRegion} now carry a region, ${changes.length - withRegion} cleared to NULL).`,
  );

  await db.pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
