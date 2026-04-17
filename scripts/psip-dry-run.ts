/* eslint-disable no-console */
//
// CLI dry-run: parse a PSIP xlsx and print the preview JSON.
//
// Usage:
//   pnpm tsx scripts/psip-dry-run.ts <path/to/xlsx>
//
// No DB writes. Exits non-zero on parse failure.

import { readFileSync } from 'node:fs';
import { parsePsipWorkbook } from '../lib/psip/parser';

const path = process.argv[2];
if (!path) {
  console.error('Usage: pnpm tsx scripts/psip-dry-run.ts <path/to/xlsx>');
  process.exit(2);
}

const buf = readFileSync(path);
const { tenders, stats, warnings } = parsePsipWorkbook(buf);

// Summary
console.log(JSON.stringify(stats, null, 2));
console.log('\nBy agency:');
const byAgency: Record<string, number> = {};
for (const t of tenders) byAgency[t.agency] = (byAgency[t.agency] ?? 0) + 1;
console.log(JSON.stringify(byAgency, null, 2));

console.log('\nBy stage:');
const byStage: Record<string, number> = {};
for (const t of tenders) byStage[t.stage] = (byStage[t.stage] ?? 0) + 1;
console.log(JSON.stringify(byStage, null, 2));

if (warnings.length) {
  console.log('\nWarnings:');
  for (const w of warnings) console.log('  -', w);
}

// First 3 tenders as a sanity check.
console.log('\nSample tenders:');
for (const t of tenders.slice(0, 3)) {
  console.log(JSON.stringify(t, null, 2));
}
