#!/usr/bin/env node
// Applies the Hinterland water register to Supabase via the service role key.
// Idempotent, and derives every value from the SAME shared mapping as the
// canonical SQL migration (142_hinterland_water_seed.sql) so the two agree.
//
//   node scripts/hinterland/import.js
//
// Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Does NOT touch nearest_airstrip_id (airstrip links are set manually).

const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(process.cwd(), 'node_modules/@supabase/supabase-js'));
const {
  SHEET, IMPORT_REASON, mapSourceType, mapSourceStatus, parseNum, rawOrNull, communityKey,
} = require('./mapping');

// -- env ----------------------------------------------------------------------
const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const data = require(path.join(__dirname, 'water_register_parsed.json'));

function bail(label, error) {
  if (error) { console.error(`FAILED at ${label}:`, error.message || error); process.exit(1); }
}

(async () => {
  const summary = {};

  // 1. Communities — manual upsert on (region, lower(name)) because the unique
  //    index is an expression index (not usable as a PostgREST onConflict target).
  const { data: existing, error: exErr } = await db.from('communities').select('id, region, name');
  bail('fetch communities', exErr);
  const idByKey = new Map((existing ?? []).map(c => [communityKey(c.region, c.name), c.id]));

  const toInsert = [];
  const toUpdate = [];
  for (const c of data.communities) {
    const key = communityKey(c.region, c.name);
    const row = { name: c.name, region: c.region, sub_district: c.sub, population: c.pop, source_sheet: SHEET };
    if (idByKey.has(key)) toUpdate.push({ id: idByKey.get(key), ...row });
    else toInsert.push(row);
  }
  if (toInsert.length) bail('insert communities', (await db.from('communities').insert(toInsert)).error);
  if (toUpdate.length) bail('update communities', (await db.from('communities').upsert(toUpdate, { onConflict: 'id' })).error);
  summary.communities = `${toInsert.length} inserted, ${toUpdate.length} updated`;

  // Refetch to get ids for every community (including the new ones).
  const { data: allComm, error: refErr } = await db.from('communities').select('id, region, name');
  bail('refetch communities', refErr);
  const idMap = new Map(allComm.map(c => [communityKey(c.region, c.name), c.id]));

  // 2. Water status (1:1 upsert on community_id).
  const wsRows = data.communities.map(c => ({
    community_id: idMap.get(communityKey(c.region, c.name)),
    status: c.status,
    coverage_percent: c.coverage,
    existing_infrastructure: c.infra,
    proposed_solutions: c.solutions,
    remarks: c.remarks,
    action: c.action,
    schools_access: c.schools,
    source_sheet: SHEET,
  }));
  bail('upsert water_status', (await db.from('water_status').upsert(wsRows, { onConflict: 'community_id' })).error);
  summary.water_status = `${wsRows.length} upserted`;

  // 3. Baseline status log (one per community, guarded so re-runs don't duplicate).
  const { data: existingLogs, error: logErr } = await db
    .from('water_status_log').select('community_id').eq('reason', IMPORT_REASON);
  bail('fetch existing logs', logErr);
  const haveLog = new Set((existingLogs ?? []).map(l => l.community_id));
  const logRows = wsRows
    .filter(w => w.community_id && !haveLog.has(w.community_id))
    .map(w => ({ community_id: w.community_id, previous_status: null, new_status: w.status, reason: IMPORT_REASON }));
  if (logRows.length) bail('insert baseline log', (await db.from('water_status_log').insert(logRows)).error);
  summary.water_status_log = `${logRows.length} baseline rows inserted (guarded)`;

  // 4. Water sources — delete-then-insert scoped to the imported (Region 9) communities.
  const srcCommunityIds = [...new Set(
    data.sources.map(s => idMap.get(communityKey(s.region, s.community))).filter(Boolean),
  )];
  if (srcCommunityIds.length) {
    bail('delete water_sources', (await db.from('water_sources').delete().in('community_id', srcCommunityIds)).error);
  }
  const srcRows = data.sources.map(s => ({
    community_id: idMap.get(communityKey(s.region, s.community)),
    source_name: s.source_name,
    source_type: mapSourceType(s.source_type),
    source_status: mapSourceStatus(s.source_status),
    production_m3hr: parseNum(s.production),
    production_raw: rawOrNull(s.production),
    pressure_psi: parseNum(s.pressure),
    pressure_raw: rawOrNull(s.pressure),
  }));
  bail('insert water_sources', (await db.from('water_sources').insert(srcRows)).error);
  summary.water_sources = `${srcRows.length} inserted across ${srcCommunityIds.length} communities`;

  // -- report -----------------------------------------------------------------
  const counts = {};
  for (const t of ['communities', 'water_status', 'water_sources', 'water_status_log']) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true });
    counts[t] = count;
  }
  console.log('\nHinterland water import complete.');
  console.log('  communities:      ', summary.communities);
  console.log('  water_status:     ', summary.water_status);
  console.log('  water_status_log: ', summary.water_status_log);
  console.log('  water_sources:    ', summary.water_sources);
  console.log('\nTable row counts now:', JSON.stringify(counts));
})();
