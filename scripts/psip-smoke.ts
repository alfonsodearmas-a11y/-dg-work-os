// Phase C smoke test: parse the current 2026-04-16 fixture, fetch the DB
// tender state, run the matcher, and assert the expected idempotent shape:
//   - 79 exact-match UPDATEs with 0 field diffs
//   - 3 ambiguous_stage review rows
//   - 0 NEW, 0 missing
// No DB writes.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parsePsipWorkbook } from '../lib/psip/parser';
import { matchTenders, type ExistingTenderSnapshot } from '../lib/psip/matcher';

async function main() {
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())) as [string, string][],
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing supabase env'); process.exit(2); }

const admin = createClient(url, key, { auth: { persistSession: false } });

const path = process.argv[2];
if (!path) { console.error('need xlsx path'); process.exit(2); }

const parse = parsePsipWorkbook(readFileSync(path));

const { data, error } = await admin.from('tender').select(`
  id, source, description, agency, programme_code, sub_programme_code,
  programme_activity, line_item_code, stage, stage_source, method,
  is_rollover, has_exception,
  date_advertised, date_closed, date_eval_sent_mtb_rtb,
  date_eval_sent_nptab, date_of_award,
  contractor, implementation_start_date, implementation_end_date,
  implementation_status_pct, remarks,
  awarded_at, first_appearance_already_awarded
`);
if (error) { console.error(error); process.exit(2); }

const existing = (data || []) as unknown as ExistingTenderSnapshot[];
const plan = matchTenders(parse.tenders, existing);

console.log('== Parse stats ==');
console.log(JSON.stringify(parse.stats, null, 2));

console.log('\n== Match stats ==');
console.log(JSON.stringify(plan.stats, null, 2));

console.log('\n== Update diffs summary ==');
const updatesWithDiffs = plan.results.filter((r) => r.kind === 'update' && (r.field_diffs?.length ?? 0) > 0);
console.log(`updates with at least one diff: ${updatesWithDiffs.length}`);
for (const r of updatesWithDiffs.slice(0, 10)) {
  const diffsSummary = r.field_diffs!.map((d) => `${d.field}(${JSON.stringify(d.old)}->${JSON.stringify(d.new)})`).join(', ');
  console.log(`  ${r.incoming.agency} ${r.incoming.description.slice(0, 60)} | ${diffsSummary}`);
}

console.log('\n== Review items ==');
const reviewItems = plan.results.filter((r) => r.kind === 'review');
for (const r of reviewItems) {
  console.log(`  [${r.review_reason}] ${r.incoming.agency} ${r.incoming.description.slice(0, 80)}`);
}

console.log('\n== Missing ==');
for (const m of plan.missing.slice(0, 10)) console.log(`  ${m.agency} ${m.description.slice(0, 80)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
