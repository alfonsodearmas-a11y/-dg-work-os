#!/usr/bin/env node
// Guardrail against name-collision mis-pins: when two or more DISTINCT communities
// were geocoded to the exact same coordinate (usually because relaxing their names
// produced the same query, e.g. "Kamwatta (Mabaruma)" and "Kamwatta (Moruca)" both
// resolving to the one OSM "Kamwatta"), at least one is wrong and we can't tell
// which — so we exclude the geocoded members back to an honest NULL. A verified
// manual pin in the group is authoritative and kept; only the non-manual members
// in its group are excluded. Idempotent + re-runnable.
//
//   node scripts/hinterland/dedupe-collisions.js

const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(process.cwd(), 'node_modules/@supabase/supabase-js'));

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data, error } = await db.from('communities')
    .select('id, name, region, latitude, longitude, geocode_source')
    .not('latitude', 'is', null);
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }

  const groups = new Map();
  for (const c of data) {
    const k = `${c.latitude},${c.longitude}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }

  let excluded = 0, collisions = 0;
  for (const [coord, members] of groups) {
    if (members.length < 2) continue;
    collisions++;
    const hasManual = members.some(m => (m.geocode_source || '').startsWith('manual'));
    const toExclude = members.filter(m => !(m.geocode_source || '').startsWith('manual'));
    console.log(`collision @ ${coord}: ${members.map(m => `R${m.region} ${m.name}`).join(' | ')}${hasManual ? ' (manual kept)' : ''}`);
    for (const m of toExclude) {
      await db.from('communities').update({
        latitude: null, longitude: null,
        geocode_source: 'geocode:collision-excluded', geocode_confidence: null, geocoded_at: new Date().toISOString(),
      }).eq('id', m.id);
      excluded++;
    }
  }

  console.log(`\nCollision groups: ${collisions}; pins excluded: ${excluded}.`);
})();
