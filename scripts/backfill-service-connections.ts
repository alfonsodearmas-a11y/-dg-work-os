/**
 * Backfill script: Seeds service_connections from existing pending_applications data.
 *
 * Usage: npx tsx scripts/backfill-service-connections.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from '@supabase/supabase-js';

const LEGACY_CUTOFF = '2015-01-01';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function classifyTrack(pipelineStage: string | null, serviceOrderType: string | null): 'A' | 'B' | 'unknown' {
  const stage = (pipelineStage || '').toLowerCase();
  const soType = (serviceOrderType || '').toLowerCase();

  if (stage.includes('design') || stage.includes('execution')) return 'B';
  if (soType.includes('execution') || soType.includes('capital') || soType.includes('network')) return 'B';
  if (stage.includes('meter') || stage.includes('estimation') || stage.includes('approval')) return 'A';
  return 'unknown';
}

async function main() {
  const supabase = getSupabase();
  console.log('Starting service_connections backfill...');

  // Check if service_connections already has data
  const { count: existingCount } = await supabase
    .from('service_connections')
    .select('id', { count: 'exact', head: true });

  if (existingCount && existingCount > 0) {
    console.log(`service_connections already has ${existingCount} records. Skipping backfill.`);
    console.log('To force re-backfill, delete existing records first.');
    return;
  }

  // Read all current GPL pending_applications
  const { data: gplRecords, error } = await supabase
    .from('pending_applications')
    .select('*')
    .eq('agency', 'GPL');

  if (error) {
    console.error('Error fetching pending_applications:', error.message);
    process.exit(1);
  }

  if (!gplRecords || gplRecords.length === 0) {
    console.log('No GPL pending_applications found. Nothing to backfill.');
    return;
  }

  console.log(`Found ${gplRecords.length} GPL pending_applications to backfill.`);

  const today = new Date().toISOString().slice(0, 10);
  let inserted = 0;
  let legacyCount = 0;
  const batchSize = 100;

  for (let i = 0; i < gplRecords.length; i += batchSize) {
    const batch = gplRecords.slice(i, i + batchSize).map(r => {
      const isLegacy = r.application_date && r.application_date < LEGACY_CUTOFF;
      const track = classifyTrack(r.pipeline_stage, r.service_order_type);

      if (isLegacy) legacyCount++;

      return {
        customer_reference: r.customer_reference,
        service_order_number: r.service_order_number || null,
        first_name: r.first_name,
        last_name: r.last_name,
        telephone: r.telephone,
        region: r.region,
        district: r.district,
        village_ward: r.village_ward,
        street: r.street,
        lot: r.lot,
        account_type: r.account_type,
        service_order_type: r.service_order_type,
        division_code: r.division_code,
        cycle: r.cycle,
        application_date: r.application_date || null,
        track,
        status: isLegacy ? 'legacy_excluded' : 'open',
        current_stage: r.pipeline_stage || null,
        stage_history: r.pipeline_stage
          ? [{ stage: r.pipeline_stage, entered: r.data_as_of || today, exited: null, days: null }]
          : [],
        first_seen_date: r.data_as_of || today,
        last_seen_date: r.data_as_of || today,
        is_legacy: !!isLegacy,
        raw_data: r.raw_data || null,
      };
    });

    const { data, error: insertError } = await supabase
      .from('service_connections')
      .insert(batch)
      .select('id');

    if (insertError) {
      console.error(`Error inserting batch at index ${i}:`, insertError.message);
    } else {
      inserted += data?.length || 0;
    }
  }

  console.log(`\nBackfill complete:`);
  console.log(`  Inserted: ${inserted} records`);
  console.log(`  Legacy (pre-2015): ${legacyCount}`);
  console.log(`  Active: ${inserted - legacyCount}`);

  // Read snapshots for historical context
  const { data: snapshots } = await supabase
    .from('pending_application_snapshots')
    .select('*')
    .eq('agency', 'GPL')
    .order('snapshot_date', { ascending: false })
    .limit(10);

  if (snapshots && snapshots.length > 0) {
    console.log(`\nHistorical snapshots found (${snapshots.length} most recent):`);
    for (const s of snapshots) {
      console.log(`  ${s.snapshot_date}: ${s.total_count} total pending`);
    }
    console.log('Note: Historical completions cannot be reconstructed from snapshots alone.');
    console.log('Completion tracking will begin with the next GPL upload.');
  }
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
