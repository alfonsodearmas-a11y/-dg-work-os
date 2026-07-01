#!/usr/bin/env node
// Geocode the hinterland communities against region context via Nominatim
// (OpenStreetMap). Writes latitude/longitude + provenance (geocode_source,
// geocode_confidence, geocoded_at) back to Supabase. Un-geocoded stays NULL —
// we never drop an approximate/region-centroid pin.
//
//   node scripts/hinterland/geocode.js                  # only never-attempted rows (geocoded_at IS NULL)
//   node scripts/hinterland/geocode.js --retry-unresolved  # + previously unresolved (latitude IS NULL)
//   node scripts/hinterland/geocode.js --force          # re-geocode everything
//
// Idempotent + re-runnable. Rate-limited to ~1 request/sec (Nominatim policy).

const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(process.cwd(), 'node_modules/@supabase/supabase-js'));

const UA = 'dg-work-os-geocoder/1.0 (alfonso.dearmas@mpua.gov.gy)';
const CONTACT_EMAIL = 'alfonso.dearmas@mpua.gov.gy';

const REGION_NAMES = {
  1: 'Barima-Waini',
  2: 'Pomeroon-Supenaam',
  3: 'Essequibo Islands-West Demerara',
  4: 'Demerara-Mahaica',
  5: 'Mahaica-Berbice',
  6: 'East Berbice-Corentyne',
  7: 'Cuyuni-Mazaruni',
  8: 'Potaro-Siparuni',
  9: 'Upper Takutu-Upper Essequibo',
  10: 'Upper Demerara-Berbice',
};

// Guyana bounding box (with a small margin) — reject anything outside it.
const BBOX = { minLon: -61.6, maxLon: -56.3, minLat: 1.0, maxLat: 8.8 };

const SETTLEMENT = new Set([
  'city', 'town', 'village', 'hamlet', 'isolated_dwelling', 'locality',
  'suburb', 'neighbourhood', 'quarter', 'farm', 'allotments',
]);
const ADMIN = new Set(['state', 'region', 'county', 'province', 'administrative', 'country']);

// -- env ----------------------------------------------------------------------
const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -- helpers ------------------------------------------------------------------
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let lastCall = 0;
async function nominatim(q) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}`
    + `&format=jsonv2&limit=1&countrycodes=gy&addressdetails=1&email=${encodeURIComponent(CONTACT_EMAIL)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const arr = await res.json();
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

const RANK = { high: 3, medium: 2, low: 1 };
const downgrade = (c) => (c === 'high' ? 'medium' : c === 'medium' ? 'low' : 'low');

// Classify a Nominatim hit into {lat, lon, confidence} or null (reject).
function classify(hit, communityName, viaRegion) {
  const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) return null;

  const category = hit.category || hit.class;
  const addrtype = hit.addresstype || hit.type;
  // Region/admin centroids are approximate pins — reject outright.
  if (category === 'boundary' || ADMIN.has(addrtype)) return null;

  const resName = norm(hit.name || (hit.display_name || '').split(',')[0]);
  const cName = norm(communityName);
  const exact = resName === cName;
  const close = exact || (cName.length > 2 && (resName.startsWith(cName) || cName.startsWith(resName)));
  const importance = Number(hit.importance) || 0;
  const isPlace = category === 'place' && SETTLEMENT.has(addrtype);

  let confidence = null;
  if (isPlace && exact) {
    confidence = (importance >= 0.30 || ['city', 'town', 'village'].includes(addrtype)) ? 'high' : 'medium';
  } else if (isPlace && close) {
    confidence = 'medium';
  } else if (isPlace && !close) {
    confidence = 'low';                       // a place, but the name doesn't match — flag for review
  } else if (category === 'highway' && close) {
    confidence = 'low';                       // road named after the village, near it
  } else {
    return null;                              // unrelated result
  }
  // Resolved without region context is less certain.
  if (!viaRegion) confidence = downgrade(confidence);
  return { lat, lon, confidence };
}

// Best geocode for a community: try with region context, then name-only.
async function geocode(name, region) {
  const regionName = REGION_NAMES[region];
  const attempts = [
    { q: `${name}, ${regionName}, Guyana`, viaRegion: true, label: 'nominatim:with-region' },
    { q: `${name}, Guyana`, viaRegion: false, label: 'nominatim:name-only' },
  ];
  let best = null;
  for (const a of attempts) {
    const hit = await nominatim(a.q);
    if (!hit) continue;
    const c = classify(hit, name, a.viaRegion);
    if (c && (!best || RANK[c.confidence] > RANK[best.confidence])) {
      best = { ...c, source: a.label };
      if (c.confidence === 'high') break;     // good enough, stop early (saves a call)
    }
  }
  return best;
}

(async () => {
  const force = process.argv.includes('--force');
  const retry = process.argv.includes('--retry-unresolved');

  let query = db.from('communities').select('id, name, region').order('name');
  if (force) { /* all */ }
  else if (retry) query = query.is('latitude', null);
  else query = query.is('geocoded_at', null);

  const { data: communities, error } = await query;
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }

  console.log(`Geocoding ${communities.length} communities (mode: ${force ? 'force' : retry ? 'retry-unresolved' : 'new-only'})\n`);

  const tally = { high: 0, medium: 0, low: 0, unresolved: 0 };
  const lowList = [];
  const unresolvedList = [];
  let done = 0;

  for (const c of communities) {
    let result = null;
    try { result = await geocode(c.name, c.region); }
    catch (e) { console.error(`  ! error on ${c.name}: ${e.message}`); }

    const nowIso = new Date().toISOString();
    if (result) {
      const { error: uErr } = await db.from('communities').update({
        latitude: result.lat, longitude: result.lon,
        geocode_source: result.source, geocode_confidence: result.confidence, geocoded_at: nowIso,
      }).eq('id', c.id);
      if (uErr) console.error(`  ! update failed ${c.name}: ${uErr.message}`);
      tally[result.confidence]++;
      if (result.confidence === 'low') lowList.push(`R${c.region}  ${c.name}  (${result.lat.toFixed(4)}, ${result.lon.toFixed(4)})  ${result.source}`);
    } else {
      const { error: uErr } = await db.from('communities').update({
        latitude: null, longitude: null,
        geocode_source: 'nominatim:unresolved', geocode_confidence: null, geocoded_at: nowIso,
      }).eq('id', c.id);
      if (uErr) console.error(`  ! update failed ${c.name}: ${uErr.message}`);
      tally.unresolved++;
      unresolvedList.push(`R${c.region}  ${c.name}`);
    }

    done++;
    if (done % 25 === 0) console.log(`  ...${done}/${communities.length}  (high ${tally.high} / med ${tally.medium} / low ${tally.low} / unresolved ${tally.unresolved})`);
  }

  // Persist a report artifact for review + print a summary.
  const report = { generatedAt: new Date().toISOString(), processed: communities.length, tally, low: lowList, unresolved: unresolvedList };
  const reportPath = path.join(__dirname, 'geocode-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n=== GEOCODE SUMMARY (processed ${communities.length}) ===`);
  console.log(`  high:       ${tally.high}`);
  console.log(`  medium:     ${tally.medium}`);
  console.log(`  low:        ${tally.low}`);
  console.log(`  unresolved: ${tally.unresolved}`);
  console.log(`\n--- LOW CONFIDENCE (${lowList.length}) — review ---`);
  lowList.forEach(l => console.log('  ' + l));
  console.log(`\n--- UNRESOLVED (${unresolvedList.length}) — review / leave NULL ---`);
  unresolvedList.forEach(l => console.log('  ' + l));
  console.log(`\nReport written to ${reportPath}`);
})();
