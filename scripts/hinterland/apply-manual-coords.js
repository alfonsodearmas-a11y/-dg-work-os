#!/usr/bin/env node
// Apply authoritative manual coordinate overrides from manual-coords.json to
// Supabase. Manual entries WIN over geocoded values (geocode_source='manual',
// geocode_confidence='high'). An entry with "exclude": true forces the pin back
// to an honest NULL. Idempotent + re-runnable.
//
//   node scripts/hinterland/apply-manual-coords.js
//
// Guardrails: rejects out-of-Guyana coordinates; never touches nearest_airstrip_id.

const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(process.cwd(), 'node_modules/@supabase/supabase-js'));

const BBOX = { minLon: -61.6, maxLon: -56.3, minLat: 1.0, maxLat: 8.8 };

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const key = (region, name) => `${region}|${String(name).trim().toLowerCase()}`;

(async () => {
  const { entries } = JSON.parse(fs.readFileSync(path.join(__dirname, 'manual-coords.json'), 'utf8'));
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log('No manual-coords entries to apply.');
    return;
  }

  const { data: communities, error } = await db.from('communities').select('id, name, region');
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  const idByKey = new Map(communities.map(c => [key(c.region, c.name), c.id]));

  let applied = 0, excluded = 0, notFound = 0, rejected = 0;
  for (const e of entries) {
    const id = idByKey.get(key(e.region, e.name));
    if (!id) { console.warn(`  ! not found: R${e.region} ${e.name}`); notFound++; continue; }

    const nowIso = new Date().toISOString();
    if (e.exclude) {
      await db.from('communities').update({
        latitude: null, longitude: null, geocode_source: 'manual:excluded', geocode_confidence: null, geocoded_at: nowIso,
      }).eq('id', id);
      console.log(`  excluded: R${e.region} ${e.name}`);
      excluded++;
      continue;
    }

    const lat = Number(e.latitude), lon = Number(e.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) {
      console.warn(`  ! rejected (out of Guyana / invalid): R${e.region} ${e.name} (${e.latitude}, ${e.longitude})`);
      rejected++;
      continue;
    }
    await db.from('communities').update({
      latitude: lat, longitude: lon, geocode_source: 'manual', geocode_confidence: e.confidence || 'high', geocoded_at: nowIso,
    }).eq('id', id);
    console.log(`  applied:  R${e.region} ${e.name}  (${lat.toFixed(4)}, ${lon.toFixed(4)})  ${e.source || ''}`);
    applied++;
  }

  console.log(`\nManual coords: ${applied} applied, ${excluded} excluded, ${notFound} not found, ${rejected} rejected.`);
})();
