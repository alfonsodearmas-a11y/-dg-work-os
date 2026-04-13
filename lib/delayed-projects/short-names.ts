/**
 * Pattern-based project name shortening for executive displays.
 *
 * Rules are applied in order. A fallback lookup handles names that
 * don't shorten cleanly via patterns. New projects added later will
 * get reasonable short names automatically through the pattern engine.
 */

// ── Fallback map for names that don't pattern-shorten well ─────────────────

const KNOWN_SHORT_NAMES: Record<string, string> = {
  'Supply and Delivery of Fiberglass Poles and Crossarms to the Hinterland Location':
    'Fiberglass Poles & Crossarms',
  'Supply of Transmission & Distribution Materials (Conductors)':
    'T&D Materials (Conductors)',
  'Construction of a Wooden New Build Passenger/cargo (Region 4)':
    'Wooden Vessel – R4',
  'Supply & Installation of In-Line Baggage Handling System':
    'Baggage Handling System',
  'Supply and installation of in line filters in Regions 2,4 and 5':
    'Inline Filters – R2/4/5',
  'Construction of a Wooden New Built Passenger/Cargo Vessel (Region 3)':
    'Wooden Vessel – R3',
  'Construction of Wooden New Build Passenger/cargo vessel (Region 2)':
    'Wooden Vessel – R2',
  'Design, supply and commissioning of fifteen in line filters Lot 2':
    'Inline Filters Lot 2 – R6',
  'Design supply and commissioning of Fifteen In line filters for GWI - Lot 4':
    'Inline Filters Lot 4 – R5',
  'Construction of New Administrative Building at the Cheddi Jagan International Airport':
    'Admin Building – CJIA',
  'Docking and Rehabilitation of vessel lot 1- ML Thompson':
    'ML Thompson Docking',
  'EPC for Infrastructure Development Phase 2 – Lot 2: Substations, T-Lines Region 5':
    'Substations & T-Lines – R5 (Lot 2)',
  'Inter Energy - Project Management Consultancy & Owner\'s Engineering Services':
    'PMC & Owner\'s Engineering',
  'EPC for Construction of Building for Guyana National Control Centre (GNCC)':
    'National Control Centre (GNCC)',
  'EPC for Infrastructure Development Phase 2 – Lot 1 & 3: Substations, T-Lines Region 4 & 6':
    'Substations & T-Lines – R4/6 (Lot 1&3)',
  'Lot 1 – Pipe, HDPE, DSIPS, SDR 11, DN, Bends, etc.':
    'HDPE Pipes & Fittings – Lot 1',
  'Automatic Meter Infrastructure - Implementation of smart metering':
    'Smart Metering (AMI)',
  'Supply and Installation of 100mm & 150mm Network Mains along Middle Street, Pouderoyen':
    'Network Mains – Pouderoyen',
  'Metering Programme: Procurement of Water Meters':
    'Water Meters Procurement',
  'Hinterland Water Supply – Red Creek Kamana':
    'Hinterland Water – Red Creek',
  'Construction & Rehabilitation Works of VIP Section, New and Existing Commercial Buildings':
    'VIP & Commercial Buildings',
  'Hinterland Electrification - Supply & Installation and commissioning of Switchgear for Kwakwani':
    'Switchgear – Kwakwani',
  'Construction of an Administrative Building at the Kato Hydropower Site':
    'Admin Building – Kato Hydro',
};

// ── Leading prefixes to strip ──────────────────────────────────────────────

const STRIP_PREFIXES = [
  'Design, Supply and Commissioning of ',
  'Design Supply and Commissioning of ',
  'Supply, Delivery and Installation of ',
  'Design and Construction of ',
  'Supply and Delivery of ',
  'Supply and Installation of ',
  'Supply & Installation of ',
  'Docking and Rehabilitation of ',
  'Construction and Rehabilitation of ',
  'Rehabilitation of ',
  'Construction of ',
  'Installation of ',
  'Procurement of ',
  'Extension of ',
  'Upgrading of ',
  'Drilling of ',
  'EPC for ',
  'Phase 2: ',
];

// ── Region abbreviation patterns ───────────────────────────────────────────

const REGION_SUFFIX_RE = /,?\s*Region\s+(\d{1,2})\s*$/i;
const REGION_PAREN_RE = /\s*\(Region\s+(\d{1,2})\)\s*$/i;
const REGIONS_MULTI_RE = /,?\s*Regions?\s+([\d,\s]+(?:and\s+\d+)?)\s*$/i;

function abbreviateRegions(name: string): string {
  // "(Region 4)" → " – R4"
  let result = name.replace(REGION_PAREN_RE, ' – R$1');
  // ", Region 10" → " – R10"
  result = result.replace(REGION_SUFFIX_RE, ' – R$1');
  // "Regions 2,4 and 5" → "R2/4/5"
  result = result.replace(REGIONS_MULTI_RE, (_match, nums: string) => {
    const digits = nums.replace(/and\s*/g, '').split(/[,\s]+/).filter(Boolean);
    return ' – R' + digits.join('/');
  });
  return result;
}

// ── Main function ──────────────────────────────────────────────────────────

const MAX_LENGTH = 45;

export function getShortName(fullName: string): string {
  // Check exact fallback first
  const known = KNOWN_SHORT_NAMES[fullName];
  if (known) return known;

  let name = fullName.trim();

  // Strip leading prefixes (case-insensitive match, preserve original casing of remainder)
  for (const prefix of STRIP_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length);
      break; // only strip one prefix
    }
  }

  // Abbreviate region references
  name = abbreviateRegions(name);

  // Clean up extra whitespace
  name = name.replace(/\s{2,}/g, ' ').trim();

  // Truncate if still long
  if (name.length > MAX_LENGTH) {
    name = name.slice(0, MAX_LENGTH - 1).trimEnd() + '…';
  }

  return name;
}
