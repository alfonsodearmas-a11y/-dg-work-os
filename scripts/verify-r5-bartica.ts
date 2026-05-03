// One-shot verification for R5 (procurement four-Bartica fix).
//
// Re-runs previewPsipUpload against the most recent applied workbook and
// reports whether the GWI/Bartica fingerprints triggered the dedup path
// instead of producing fresh tender_match_review rows.
//
// The verification upload row is cancelled at the end so it does not
// pollute the apply pipeline. The dedup writes to seen_in_uploads on
// existing review rows are LEFT IN PLACE — that is the observable signal.
//
// Usage: npx tsx scripts/verify-r5-bartica.ts

import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Load .env.local (matches psip-smoke.ts pattern).
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }) as [string, string][],
);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Provide globals that lib/db expects on import.
process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BARTICA_PREFIX = 'GWI|343|2802200|';

async function snapshotBartica(label: string) {
  const { data, error } = await supabase
    .from('tender_match_review')
    .select('id, parsed_row_fingerprint, seen_in_uploads, status, created_at')
    .like('parsed_row_fingerprint', `${BARTICA_PREFIX}%bartica%`)
    .order('parsed_row_fingerprint', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  console.log(`\n== Bartica review rows (${label}) — count=${rows.length} ==`);
  for (const r of rows) {
    const fpTail = (r.parsed_row_fingerprint as string).split('|').slice(-1)[0].slice(0, 60);
    const seen = (r.seen_in_uploads as string[]) ?? [];
    console.log(`  [${r.status}] seen_in_uploads.length=${seen.length}  fp=…${fpTail}`);
  }
  return rows;
}

async function main() {
  const { previewPsipUpload, cancelPsipUpload } = await import('../lib/psip/ingest');

  const { data: latest, error: latestErr } = await supabase
    .from('upload')
    .select('id, filename, storage_path, uploaded_by, uploaded_at')
    .eq('status', 'applied')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();
  if (latestErr || !latest) {
    console.error('No applied upload found.');
    process.exit(2);
  }
  console.log(`Source upload: ${latest.id} (${latest.filename}) at ${latest.uploaded_at}`);

  const before = await snapshotBartica('BEFORE');

  console.log(`\nDownloading ${latest.storage_path}…`);
  const { data: file, error: dlErr } = await supabase.storage
    .from('psip-uploads')
    .download(latest.storage_path as string);
  if (dlErr || !file) {
    console.error('Download failed:', dlErr);
    process.exit(3);
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  console.log(`\nRunning previewPsipUpload (verification re-preview)…`);
  const outcome = await previewPsipUpload(buffer, {
    uploadedBy: latest.uploaded_by as string,
    filename: `[R5 verify] ${latest.filename}`,
    storagePath: latest.storage_path as string,
  });
  console.log(`Verification upload_id: ${outcome.upload_id}`);
  console.log('Match stats:', JSON.stringify(outcome.match_stats, null, 2));

  // Read upload.stats so we can confirm the new R5 counters are populated.
  const { data: uploadRow } = await supabase
    .from('upload')
    .select('id, stats')
    .eq('id', outcome.upload_id)
    .single();
  console.log(
    '\nupload.stats:',
    JSON.stringify(
      {
        excluded_via_skip: uploadRow?.stats?.excluded_via_skip,
        prior_supersedes: uploadRow?.stats?.prior_supersedes,
        prior_duplicates: uploadRow?.stats?.prior_duplicates,
      },
      null,
      2,
    ),
  );

  const after = await snapshotBartica('AFTER');

  // Cancel the verification upload so it never gets applied.
  await cancelPsipUpload(outcome.upload_id);
  console.log(`\nVerification upload ${outcome.upload_id} cancelled.`);

  // Behavioral assertions.
  console.log('\n== Verification summary ==');
  console.log(`  rows BEFORE: ${before.length}`);
  console.log(`  rows AFTER:  ${after.length}`);
  const inserted = after.length - before.length;
  console.log(`  net inserts: ${inserted} (expected 0)`);
  let grew = 0;
  for (const a of after) {
    const b = before.find((x) => x.id === a.id);
    if (!b) continue;
    const bn = ((b.seen_in_uploads as string[]) ?? []).length;
    const an = ((a.seen_in_uploads as string[]) ?? []).length;
    if (an > bn) grew++;
  }
  console.log(`  rows whose seen_in_uploads grew: ${grew} (expect ≥3 — one per fingerprint)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
