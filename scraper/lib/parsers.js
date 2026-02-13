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

module.exports = {
  BASE_URL,
  parseCurrency,
  parseApexDate,
  parsePercent,
  buildApexUrl,
  delay,
  getDelay,
};
