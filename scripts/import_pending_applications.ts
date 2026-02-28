/**
 * Import pending service connection applications from GPL and GWI Excel files.
 *
 * Usage:
 *   npx tsx scripts/import_pending_applications.ts --gwi ./path/to/gwi.xlsx --gpl ./path/to/gpl.xls
 *
 * Either --gwi or --gpl (or both) can be provided.
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parseGPLBuffer, parseGWIBuffer } from '../lib/pending-applications-parser';
import { createSnapshot } from '../lib/pending-applications-snapshots';
import type { PendingRecord } from '../lib/pending-applications-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function parseArgs(): { gwi?: string; gpl?: string } {
  const args = process.argv.slice(2);
  const result: { gwi?: string; gpl?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gwi' && args[i + 1]) result.gwi = args[++i];
    if (args[i] === '--gpl' && args[i + 1]) result.gpl = args[++i];
  }
  return result;
}

async function upsertRecords(records: PendingRecord[]): Promise<{ inserted: number }> {
  let inserted = 0;

  const agencies = [...new Set(records.map(r => r.agency))];
  for (const agency of agencies) {
    const { error } = await supabase
      .from('pending_applications')
      .delete()
      .eq('agency', agency);
    if (error) console.error(`Error clearing ${agency} records:`, error.message);
  }

  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('pending_applications')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`Error inserting batch at offset ${i}:`, error.message);
    } else {
      inserted += data?.length || 0;
    }
  }

  return { inserted };
}

async function main() {
  const args = parseArgs();

  if (!args.gwi && !args.gpl) {
    console.error('Usage: npx tsx scripts/import_pending_applications.ts --gwi ./path/to/gwi.xlsx --gpl ./path/to/gpl.xls');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pending Applications Import');
  console.log('═══════════════════════════════════════════════════════\n');

  let allRecords: PendingRecord[] = [];

  if (args.gwi) {
    console.log(`Parsing GWI file: ${args.gwi}`);
    const buffer = fs.readFileSync(args.gwi);
    const result = parseGWIBuffer(buffer);
    if (!result.success) {
      console.error('GWI parse failed:', result.warnings.join('; '));
    } else {
      console.log(`  ${result.records.length} GWI records parsed (sheet: ${result.sheetName}, as of ${result.dataAsOf})`);
      if (result.warnings.length > 0) console.warn('  Warnings:', result.warnings.join('; '));
      allRecords.push(...result.records);
      await createSnapshot('GWI', result.records, result.dataAsOf);
    }
  }

  if (args.gpl) {
    console.log(`Parsing GPL file: ${args.gpl}`);
    const buffer = fs.readFileSync(args.gpl);
    const result = parseGPLBuffer(buffer);
    if (!result.success) {
      console.error('GPL parse failed:', result.warnings.join('; '));
    } else {
      console.log(`  ${result.records.length} GPL records parsed (sheet: ${result.sheetName}, as of ${result.dataAsOf})`);
      if (result.warnings.length > 0) console.warn('  Warnings:', result.warnings.join('; '));
      allRecords.push(...result.records);
      await createSnapshot('GPL', result.records, result.dataAsOf);
    }
  }

  if (allRecords.length === 0) {
    console.log('No records to import.');
    return;
  }

  console.log('\nUploading to Supabase...');
  const result = await upsertRecords(allRecords);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Import Summary');
  console.log('═══════════════════════════════════════════════════════');

  const gwiCount = allRecords.filter(r => r.agency === 'GWI').length;
  const gplCount = allRecords.filter(r => r.agency === 'GPL').length;

  if (gwiCount > 0) {
    const dataAsOf = allRecords.find(r => r.agency === 'GWI')?.data_as_of;
    console.log(`  GWI: ${gwiCount} records (data as of ${dataAsOf})`);
  }
  if (gplCount > 0) {
    const dataAsOf = allRecords.find(r => r.agency === 'GPL')?.data_as_of;
    console.log(`  GPL: ${gplCount} records (data as of ${dataAsOf})`);
  }
  console.log(`  Total inserted: ${result.inserted}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
