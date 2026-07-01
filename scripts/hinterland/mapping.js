// Shared register→DB mapping for the Hinterland water seed. Used by BOTH
// generate-seed.js (canonical SQL migration 142) and import.js (service-key
// applier) so the two can never diverge. The JSON is the source of truth:
// `coverage` is already 0..100 and `status` is already the module vocabulary —
// we only normalize source_type / source_status and parse production/pressure.

const SHEET = 'GWI Hinterland Water Register';
const IMPORT_REASON = 'Initial import from GWI register';

const SOURCE_TYPE_MAP = {
  'Drilled well 4"': 'drilled_well_4',
  'Drilled well 6"': 'drilled_well_6',
  'Drilled well 8"': 'drilled_well_8',
  'Hand-dug well': 'hand_dug_well',
  'Drilled well': 'drilled_well',
  'Driled well': 'drilled_well',   // register typo
  'drilled well': 'drilled_well',  // register typo
  'Gravity Spring': 'gravity_spring',
  'Creek Source': 'creek_source',
};

function mapSourceType(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return SOURCE_TYPE_MAP[t] ?? t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const SOURCE_STATUS_MAP = {
  Active: 'active',
  Inactive: 'inactive',
  'Not Active': 'inactive',
  'Pending Activation': 'pending_activation',
};

function mapSourceStatus(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return SOURCE_STATUS_MAP[t] ?? t.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// First number in a messy string ("26.4m3/h" -> 26.4, bare "PSI" -> null).
function parseNum(v) {
  if (v == null) return null;
  const m = String(v).match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

// Trimmed original string, or null when empty (keep raw provenance otherwise).
function rawOrNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

// Case-insensitive natural key for a community: `${region}|${lower(name)}`.
function communityKey(region, name) {
  return `${region}|${String(name).trim().toLowerCase()}`;
}

module.exports = {
  SHEET,
  IMPORT_REASON,
  mapSourceType,
  mapSourceStatus,
  parseNum,
  rawOrNull,
  communityKey,
};
