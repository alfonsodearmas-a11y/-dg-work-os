#!/usr/bin/env node
// One-time asset: fetch Guyana's boundary polygon from Nominatim (OpenStreetMap),
// keep the largest ring (mainland), simplify it, and write it to
// lib/hinterland/guyana-outline.json for the dependency-free SVG point map.
//
//   node scripts/hinterland/fetch-guyana-outline.js

const fs = require('fs');
const path = require('path');

const UA = 'dg-work-os-geocoder/1.0 (alfonso.dearmas@mpua.gov.gy)';

// Radial-distance simplification: drop points within `eps` degrees of the last kept
// point. Good enough for a background outline at a few hundred px.
function simplify(ring, eps) {
  if (ring.length < 3) return ring;
  const out = [ring[0]];
  let last = ring[0];
  for (let i = 1; i < ring.length - 1; i++) {
    const [lo, la] = ring[i];
    const dx = lo - last[0], dy = la - last[1];
    if (dx * dx + dy * dy >= eps * eps) { out.push(ring[i]); last = ring[i]; }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

(async () => {
  const url = 'https://nominatim.openstreetmap.org/search?country=Guyana&format=jsonv2&polygon_geojson=1&limit=1';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  const geo = data[0]?.geojson;
  if (!geo) { console.error('No polygon returned'); process.exit(1); }

  // Collect outer rings (Polygon -> [outer, ...holes]; MultiPolygon -> [[outer,...], ...]).
  let outerRings = [];
  if (geo.type === 'Polygon') outerRings = [geo.coordinates[0]];
  else if (geo.type === 'MultiPolygon') outerRings = geo.coordinates.map(poly => poly[0]);
  else { console.error('Unexpected geometry', geo.type); process.exit(1); }

  // Largest ring = mainland.
  outerRings.sort((a, b) => b.length - a.length);
  const mainland = outerRings[0];
  const simplified = simplify(mainland, 0.015);

  // bbox over the simplified ring.
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of simplified) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const outPath = path.join(__dirname, '..', '..', 'lib', 'hinterland', 'guyana-outline.json');
  const payload = {
    bbox: [minLon, minLat, maxLon, maxLat],
    ring: simplified.map(([lon, lat]) => [Number(lon.toFixed(4)), Number(lat.toFixed(4))]),
  };
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath}`);
  console.log(`  original points: ${mainland.length}, simplified: ${simplified.length}`);
  console.log(`  bbox: [${payload.bbox.map(n => n.toFixed(3)).join(', ')}]`);
})();
