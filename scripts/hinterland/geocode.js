#!/usr/bin/env node
// Geocode the hinterland communities against region context via Nominatim
// (OpenStreetMap). Writes latitude/longitude + provenance (geocode_source,
// geocode_confidence, geocoded_at) back to Supabase. Un-geocoded stays NULL —
// we never drop an approximate / region-centroid pin.
//
//   node scripts/hinterland/geocode.js                     # never-attempted rows (geocoded_at IS NULL), original name only
//   node scripts/hinterland/geocode.js --retry-unresolved  # unresolved rows (latitude IS NULL), with RELAXED name forms
//   node scripts/hinterland/geocode.js --force             # every row, original + relaxed forms
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

// Transforms that change the *meaning* of the name (not just formatting) cap the
// confidence so a relaxed match can never read as a precise, exact hit.
const CAPPED = new Set(['paren', 'drop-qualifier', 'slash', 'alias']);
function capConfidence(conf, transform) {
  if (transform === 'mile-marker') return 'low';          // road mile-marker → base town is approximate
  if (CAPPED.has(transform) && conf === 'high') return 'medium';
  return conf;
}

// Alternate name forms for the relaxed pass. Each carries the transform that
// produced it (drives the confidence cap). Identity is added by the caller.
function altForms(name) {
  const out = [];
  const seen = new Set([name.toLowerCase()]);
  const push = (form, transform) => {
    const f = String(form).replace(/\s+/g, ' ').trim();
    if (f && f.length > 1 && !seen.has(f.toLowerCase())) { seen.add(f.toLowerCase()); out.push({ form: f, transform }); }
  };
  const normalize = (s) => s
    .replace(/[’]/g, "'")
    .replace(/\bSt\.?\s+/gi, 'Saint ')   // St. Ignatius → Saint Ignatius
    .replace(/'s\b/g, 's')               // Matthew's → Matthews
    .replace(/'/g, '');

  // 1. Pure normalization (possessive / St. / punctuation) — no meaning change.
  const nn = normalize(name);
  if (nn.toLowerCase() !== name.toLowerCase()) push(nn, 'normalize');

  // 2. Mile-marker prefix ("47 Miles Mabura" → "Mabura", "4 Mile kaituma" → "kaituma").
  const mm = name.match(/^\d+\s*miles?\b\s*(.+)$/i);
  if (mm && mm[1]) push(normalize(mm[1]), 'mile-marker');

  // 3. Parenthetical strip ("Arakaka (Central station)" → "Arakaka").
  const paren = name.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (paren && paren.toLowerCase() !== name.toLowerCase()) push(normalize(paren), 'paren');

  // 4. Slash alternatives ("Kamarang/Warawatta" → "Kamarang", "Warawatta").
  if (name.includes('/')) name.split('/').map(s => s.trim()).filter(Boolean).forEach(p => push(normalize(p), 'slash'));

  // 5. Drop administrative qualifiers + trailing dash/comma modifiers.
  const dq = name
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(central|settlement|scheme)\b/gi, '')
    .replace(/\b(old|new)\s+well\b/gi, '')
    .replace(/\bwell\s*\d*\b/gi, '')
    .replace(/\s*[-,].*$/, '')            // "Abrams Creek - Warapana" → "Abrams Creek"; "Jacklow, Pomeroon" → "Jacklow"
    .replace(/\s+/g, ' ').trim();
  if (dq && dq.toLowerCase() !== name.toLowerCase()) push(normalize(dq), 'drop-qualifier');

  return out.slice(0, 4);                 // bound the request budget per community
}

// Classify a Nominatim hit for a given FORM into {lat, lon, confidence} or null.
function classify(hit, formName, viaRegion, transform) {
  const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon < BBOX.minLon || lon > BBOX.maxLon || lat < BBOX.minLat || lat > BBOX.maxLat) return null;

  const category = hit.category || hit.class;
  const addrtype = hit.addresstype || hit.type;
  if (category === 'boundary' || ADMIN.has(addrtype)) return null;   // region/admin centroid — reject

  const resName = norm(hit.name || (hit.display_name || '').split(',')[0]);
  const cName = norm(formName);
  const exact = resName === cName;
  const close = exact || (cName.length > 2 && (resName.startsWith(cName) || cName.startsWith(resName)));
  const importance = Number(hit.importance) || 0;
  const isPlace = category === 'place' && SETTLEMENT.has(addrtype);

  let confidence = null;
  if (isPlace && exact) confidence = (importance >= 0.30 || ['city', 'town', 'village'].includes(addrtype)) ? 'high' : 'medium';
  else if (isPlace && close) confidence = 'medium';
  else if (isPlace && !close) confidence = 'low';
  else if (category === 'highway' && close) confidence = 'low';
  else return null;

  // Name-only (no region context) must match the form EXACTLY — otherwise a
  // common name could pin to the wrong same-named village. Reject fuzzy name-only.
  if (!viaRegion && !exact) return null;
  if (!viaRegion) confidence = downgrade(confidence);
  return { lat, lon, confidence: capConfidence(confidence, transform) };
}

// Best geocode for a community across its forms. Stops early on a medium+ hit.
async function geocode(name, region, mode) {
  const forms = [];
  if (mode === 'new' || mode === 'full') forms.push({ form: name, transform: 'identity' });
  if (mode === 'relaxed' || mode === 'full') forms.push(...altForms(name));

  let best = null;
  for (const f of forms) {
    for (const via of [true, false]) {            // with-region first, then name-only
      const q = via ? `${f.form}, ${REGION_NAMES[region]}, Guyana` : `${f.form}, Guyana`;
      const hit = await nominatim(q);
      if (!hit) continue;
      const c = classify(hit, f.form, via, f.transform);
      if (!c) continue;
      if (!best || RANK[c.confidence] > RANK[best.confidence]) {
        best = {
          ...c,
          source: `nominatim:${via ? 'with-region' : 'name-only'}${f.transform !== 'identity' ? `:${f.transform}` : ''}`,
          form: f.form,
        };
      }
      if (best && RANK[best.confidence] >= RANK.medium) return best;   // good enough — save requests
    }
  }
  return best;
}

(async () => {
  const force = process.argv.includes('--force');
  const retry = process.argv.includes('--retry-unresolved');
  const mode = force ? 'full' : retry ? 'relaxed' : 'new';

  let query = db.from('communities').select('id, name, region').order('name');
  if (retry) query = query.is('latitude', null);
  else if (!force) query = query.is('geocoded_at', null);

  const { data: communities, error } = await query;
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }

  console.log(`Geocoding ${communities.length} communities (mode: ${mode})\n`);

  const tally = { high: 0, medium: 0, low: 0, unresolved: 0 };
  const lowList = [];
  const unresolvedList = [];
  const resolvedNow = [];
  let done = 0;

  for (const c of communities) {
    let result = null;
    try { result = await geocode(c.name, c.region, mode); }
    catch (e) { console.error(`  ! error on ${c.name}: ${e.message}`); }

    const nowIso = new Date().toISOString();
    if (result) {
      const { error: uErr } = await db.from('communities').update({
        latitude: result.lat, longitude: result.lon,
        geocode_source: result.source, geocode_confidence: result.confidence, geocoded_at: nowIso,
      }).eq('id', c.id);
      if (uErr) console.error(`  ! update failed ${c.name}: ${uErr.message}`);
      tally[result.confidence]++;
      resolvedNow.push(`R${c.region}  ${c.name}  [${result.confidence}]  via ${result.form}  (${result.lat.toFixed(4)}, ${result.lon.toFixed(4)})`);
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

  const report = { generatedAt: new Date().toISOString(), mode, processed: communities.length, tally, resolvedThisRun: resolvedNow, low: lowList, unresolved: unresolvedList };
  fs.writeFileSync(path.join(__dirname, 'geocode-report.json'), JSON.stringify(report, null, 2));

  console.log(`\n=== GEOCODE SUMMARY (mode ${mode}, processed ${communities.length}) ===`);
  console.log(`  high:       ${tally.high}`);
  console.log(`  medium:     ${tally.medium}`);
  console.log(`  low:        ${tally.low}`);
  console.log(`  unresolved: ${tally.unresolved}`);
  console.log(`\n--- RESOLVED THIS RUN (${resolvedNow.length}) ---`);
  resolvedNow.forEach(l => console.log('  ' + l));
  console.log(`\n--- STILL UNRESOLVED (${unresolvedList.length}) ---`);
  unresolvedList.forEach(l => console.log('  ' + l));
})();
