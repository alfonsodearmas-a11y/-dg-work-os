/**
 * Pattern-based project name shortening for executive displays.
 *
 * Uses case-insensitive substring matching against a known map,
 * then falls back to prefix-stripping and region abbreviation.
 * New projects added later get reasonable short names automatically.
 */

// ── Known short name map (substring keys, case-insensitive) ──────────────────
// Keys are the shortest reliable substring that uniquely identifies the project.

const KNOWN_SHORT_NAMES: [string, string][] = [
  ['Fiberglass Poles and Crossarms', 'Fiberglass Poles & Crossarms'],
  ['Transmission & Distribution Materials', 'T&D Materials (Conductors)'],
  ['Wooden New Build Passenger/cargo', 'Wooden Vessel – R4'], // R4 variant (lowercase "cargo")
  ['In-Line Baggage Handling System', 'Baggage Handling System'],
  ['in line filters in Regions 2,4 and 5', 'Inline Filters – R2/4/5'],
  ['Wooden New Built Passenger/Cargo Vessel', 'Wooden Vessel – R3'], // R3 variant ("Built", uppercase "Cargo")
  ['Wooden New Build Passenger/cargo vessel', 'Wooden Vessel – R2'], // R2 variant (lowercase "vessel")
  ['fifteen in line filters Lot 2', 'Inline Filters Lot 2 – R6'],
  ["Matthew's Ridge Airstrip", "Matthew's Ridge Airstrip"],
  ['Kwakwani Airstrip', 'Kwakwani Airstrip'],
  ['In line filters for GWI - Lot 4', 'Inline Filters Lot 4 – R5'],
  ['In line filters for GWI- Lot 4', 'Inline Filters Lot 4 – R5'], // variant without space before dash
  ['Kaikan Airstrip', 'Kaikan Airstrip'],
  ['Extension of Ekereku Bottom Airstrip', 'Ekereku Bottom Airstrip Ph2'],
  ['Administrative Building at the Cheddi Jagan', 'Admin Building – CJIA'],
  ['Jawalla Airstrip', 'Jawalla Airstrip'],
  ['ML Thompson', 'ML Thompson Docking'],
  ['Lot 2: Construction of Substations, Transmission Lines', 'Substations & T-Lines – R5 (Lot 2)'],
  ['Lot 2: Substations, T-Lines Region 5', 'Substations & T-Lines – R5 (Lot 2)'],
  ['Lot 2: Substations', 'Substations & T-Lines – R5 (Lot 2)'],
  ['Project Management Consultancy & Owner', 'PMC & Owner\'s Engineering'],
  ["Project Management Consultancy & Owner's Engineering", 'PMC & Owner\'s Engineering'],
  ['Guyana National Control Centre', 'National Control Centre (GNCC)'],
  ['Lot 1 & 3: Construction of Substations, Transmission Lines', 'Substations & T-Lines – R4/6 (Lot 1&3)'],
  ['Lot 1 & 3: Substations, T-Lines Region 4', 'Substations & T-Lines – R4/6 (Lot 1&3)'],
  ['Lot 1 & 3: Substations', 'Substations & T-Lines – R4/6 (Lot 1&3)'],
  ['Lithium-Ion Solar Batteries', 'Lithium-Ion Solar Batteries'],
  ['Lithium- Ion Solar Batteries', 'Lithium-Ion Solar Batteries'], // variant with space after hyphen
  ['Pipe, HDPE, DSIPS', 'HDPE Pipes & Fittings – Lot 1'],
  ['Automatic Meter Infrastructure', 'Smart Metering (AMI)'],
  ['Smart Metering', 'Smart Metering (AMI)'],
  ['New Well - Shelter Belt', 'New Well – Shelter Belt'],
  ['New Well- Shelter Belt', 'New Well – Shelter Belt'],
  ['Network Mains along Middle Street, Pouderoyen', 'Network Mains – Pouderoyen'],
  ['Network Mains along Middle Street', 'Network Mains – Pouderoyen'],
  ['New Wells – Johanna', 'New Wells – Johanna'],
  ['New Wells - Johanna', 'New Wells – Johanna'],
  ['New Wells – Yakasari', 'New Wells – Yakasari'],
  ['New Wells - Yakasari', 'New Wells – Yakasari'],
  ['New Wells – Pouderyoen', 'New Wells – Pouderoyen'],
  ['New Wells - Pouderyoen', 'New Wells – Pouderoyen'],
  ['New Wells – Pouderoyen', 'New Wells – Pouderoyen'],
  ['New Wells - Pouderoyen', 'New Wells – Pouderoyen'],
  ['Procurement of Water Meters', 'Water Meters Procurement'],
  ['Red Creek Kamana', 'Hinterland Water – Red Creek'],
  ['Red Creek', 'Hinterland Water – Red Creek'],
  ['VIP Section, New and Existing Commercial', 'VIP & Commercial Buildings'],
  ['Switchgear for Kwakwani', 'Switchgear – Kwakwani'],
  ['Administrative Building at the Kato Hydropower', 'Admin Building – Kato Hydro'],
  ['GWi Corporate Complex', 'GWI Corporate Complex'],
  ['GWI Corporate Complex', 'GWI Corporate Complex'],
];

// Sort by key length descending so longer (more specific) matches win
const SORTED_SHORT_NAMES = [...KNOWN_SHORT_NAMES].sort((a, b) => b[0].length - a[0].length);

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
  'Construction & Rehabilitation Works of ',
  'Rehabilitation of ',
  'Construction of ',
  'Installation of ',
  'Procurement of ',
  'Extension of ',
  'Upgrading of ',
  'Drilling of ',
  'EPC for ',
  'Phase 2: ',
  'Hinterland Electrification - Supply & Installation and commissioning of ',
  'Hinterland Electrification - ',
  'Hinterland Water Supply – ',
  'Hinterland Water Supply - ',
  'Metering Programme: ',
  'Infrastructure Development Phase 2 – ',
  'Infrastructure Development Phase 2 - ',
];

// ── Region abbreviation patterns ───────────────────────────────────────────

const REGION_SUFFIX_RE = /,?\s*Region\s+(\d{1,2})\s*$/i;
const REGION_PAREN_RE = /\s*\(Region\s+(\d{1,2})\)\s*$/i;
const REGIONS_MULTI_RE = /,?\s*Regions?\s+([\d,\s]+(?:and\s+\d+)?)\s*$/i;

function abbreviateRegions(name: string): string {
  let result = name.replace(REGION_PAREN_RE, ' – R$1');
  result = result.replace(REGION_SUFFIX_RE, ' – R$1');
  result = result.replace(REGIONS_MULTI_RE, (_match, nums: string) => {
    const digits = nums.replace(/and\s*/g, '').split(/[,\s]+/).filter(Boolean);
    return ' – R' + digits.join('/');
  });
  return result;
}

// ── Main function ──────────────────────────────────────────────────────────

export function getShortName(fullName: string): string {
  const normalized = fullName.trim().replace(/\s{2,}/g, ' ');
  const lower = normalized.toLowerCase();

  // Substring match against known map (longest key wins)
  for (const [key, shortName] of SORTED_SHORT_NAMES) {
    if (lower.includes(key.toLowerCase())) {
      return shortName;
    }
  }

  // Fallback: strip prefixes and abbreviate regions
  let name = normalized;

  for (const prefix of STRIP_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = name.slice(prefix.length);
      break;
    }
  }

  name = abbreviateRegions(name);
  name = name.replace(/\s{2,}/g, ' ').trim();

  return name;
}

// ── Contractor name sanitization ───────────────────────────────────────────

export function sanitizeContractors(raw: string | null): string {
  if (!raw) return '';
  return raw
    .split(/<br\s*\/?>/gi)
    .flatMap(s => s.split(','))
    .map(s => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
    .join(' / ');
}
