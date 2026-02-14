/**
 * Shared parsing utilities for oversight.gov.gy data.
 */

const BASE_URL = 'https://oversight.gov.gy/ords/r/oneguyanaapps/oversight';

const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/**
 * Parse a single currency token like "$55.7B", "$1.2M", "$500K", "$1,234,567.89".
 */
function parseSingleCurrency(token) {
  if (!token || typeof token !== 'string') return null;
  // Remove $ and spaces, keep digits, commas, dots, and suffix letters
  const trimmed = token.replace(/^\$/, '').trim();
  if (!trimmed) return null;

  const multipliers = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 };
  const suffix = trimmed.slice(-1).toUpperCase();
  if (multipliers[suffix]) {
    const num = parseFloat(trimmed.slice(0, -1).replace(/,/g, ''));
    return isNaN(num) ? null : num * multipliers[suffix];
  }

  const num = parseFloat(trimmed.replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Parse currency strings into numeric values.
 * Handles single values ("$1,234,567") and multi-value cells
 * ("$12,080,300,$39,819,650") by summing all values.
 */
function parseCurrency(str) {
  if (!str || typeof str !== 'string') return null;

  // Split on "$" to handle multiple dollar-prefixed values in one cell
  const parts = str.split('$').filter((s) => s.trim());
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return parseSingleCurrency('$' + parts[0]);
  }

  // Multiple values: sum them
  let total = 0;
  for (const part of parts) {
    const val = parseSingleCurrency('$' + part.replace(/,$/, ''));
    if (val !== null) total += val;
  }
  return total || null;
}

/**
 * Parse Oracle APEX date format "24-JAN-2026" -> "2026-01-24"
 */
function parseApexDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (!match) return null;
  const [, day, monthStr, year] = match;
  const month = MONTH_MAP[monthStr.toUpperCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

/**
 * Parse percentage string "30%" -> 30, "30% ( 69 )" -> { percent: 30, count: 69 }
 */
function parsePercent(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();

  // Handle donut chart format: "31% ( 69 )"
  const donutMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%\s*\(\s*(\d+)\s*\)/);
  if (donutMatch) {
    return {
      percent: parseFloat(donutMatch[1]),
      count: parseInt(donutMatch[2], 10),
    };
  }

  // Simple percentage: "30%"
  const simpleMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
  if (simpleMatch) {
    return parseFloat(simpleMatch[1]);
  }

  return null;
}

/**
 * Build a full Oracle APEX URL with session and optional params.
 */
function buildApexUrl(page, sessionId, params = {}) {
  let url = `${BASE_URL}/${page}`;
  if (sessionId) {
    url += `?session=${sessionId}`;
    for (const [key, val] of Object.entries(params)) {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
    }
  }
  return url;
}

/**
 * Delay for ms milliseconds.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get configured delay from env or default.
 */
function getDelay() {
  return parseInt(process.env.DELAY_MS, 10) || 2000;
}

/**
 * Format a numeric value as a readable currency string.
 * 49356100 -> "$49,356,100"
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return null;
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Region code to name mapping for Guyana's 10 regions.
 */
const REGION_NAMES = {
  '01': 'Region 1 - Barima-Waini',
  '02': 'Region 2 - Pomeroon-Supenaam',
  '03': 'Region 3 - Essequibo Islands-West Demerara',
  '04': 'Region 4 - Demerara-Mahaica',
  '05': 'Region 5 - Mahaica-Berbice',
  '06': 'Region 6 - East Berbice-Corentyne',
  '07': 'Region 7 - Cuyuni-Mazaruni',
  '08': 'Region 8 - Potaro-Siparuni',
  '09': 'Region 9 - Upper Takutu-Upper Essequibo',
  '10': 'Region 10 - Upper Demerara-Berbice',
  '1': 'Region 1 - Barima-Waini',
  '2': 'Region 2 - Pomeroon-Supenaam',
  '3': 'Region 3 - Essequibo Islands-West Demerara',
  '4': 'Region 4 - Demerara-Mahaica',
  '5': 'Region 5 - Mahaica-Berbice',
  '6': 'Region 6 - East Berbice-Corentyne',
  '7': 'Region 7 - Cuyuni-Mazaruni',
  '8': 'Region 8 - Potaro-Siparuni',
  '9': 'Region 9 - Upper Takutu-Upper Essequibo',
};

/**
 * Agency code to full name mapping.
 */
const AGENCY_NAMES = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  GCAA: 'Guyana Civil Aviation Authority',
  MARAD: 'Maritime Administration Department',
  HECI: 'Hinterland Electrification Company Inc.',
  HAS: 'Harbour & Aviation Services',
  MOPUA: 'Ministry of Public Utilities & Aviation',
};

/**
 * Convert a raw scraped region code to a readable name.
 */
function formatRegion(code) {
  if (!code) return null;
  return REGION_NAMES[code.trim()] || `Region ${code}`;
}

/**
 * Convert an agency code to its full name.
 */
function formatAgency(code) {
  if (!code) return null;
  return AGENCY_NAMES[code.trim()] || code;
}

/**
 * Normalize a raw scraped project into the standard shape.
 * Every project in every section of the output uses this format.
 */
function standardizeProject(raw) {
  const contractValue = raw.contractValue ?? null;
  const completion = raw.completionPercent ?? null;
  const endDate = raw.projectEndDate ?? null;
  const regionCode = raw.region ?? null;

  return {
    id: raw.p3Id || null,
    reference: raw.projectReference || null,
    name: raw.projectName || null,
    agency: raw.subAgency || raw.executingAgency || null,
    agencyFull: formatAgency(raw.subAgency || raw.executingAgency),
    ministry: raw.executingAgency || null,
    region: formatRegion(regionCode),
    regionCode,
    contractor: raw.contractors || null,
    contractValue,
    contractValueDisplay: formatCurrency(contractValue),
    completion,
    endDate,
    hasImages: raw.hasImages ? parseInt(raw.hasImages, 10) || 0 : 0,
  };
}

module.exports = {
  BASE_URL,
  parseCurrency,
  parseApexDate,
  parsePercent,
  buildApexUrl,
  delay,
  getDelay,
  formatCurrency,
  formatRegion,
  formatAgency,
  standardizeProject,
  REGION_NAMES,
  AGENCY_NAMES,
};
