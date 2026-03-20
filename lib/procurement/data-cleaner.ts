// ── Date Parsing ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(s: string): number | undefined {
  return MONTHS[s.toLowerCase().slice(0, 3)];
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Build ISO date string, returning null if the day is invalid for the month. */
function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(y, m, d);
  // Date constructor rolls over invalid days (e.g. Feb 31 → Mar 3)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
    return null;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse dates in various loose formats into ISO YYYY-MM-DD.
 * Handles: DD-MMM-YY, DD-MMM-YYYY, DD-MMM, D-Mon-YY, DD/MM/YYYY, YYYY-MM-DD, M/D/YYYY.
 * Missing year defaults to the current year.
 */
export function parseFlexibleDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // DD-MMM-YY or DD-MMM-YYYY or DD-MMM (separators: - / . space)
  const dmy = v.match(/^(\d{1,2})[/\-.\s]+([A-Za-z]{3,9})(?:[/\-.\s]+(\d{2,4}))?$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const mi = monthIndex(dmy[2]);
    if (mi !== undefined && day >= 1 && day <= 31) {
      const year = dmy[3] ? expandYear(parseInt(dmy[3], 10)) : new Date().getFullYear();
      return isoDate(year, mi, day);
    }
  }

  // DD/MM/YYYY
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return isoDate(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  }

  // M/D/YYYY (US format — month first, only when month <= 12 and day > 12)
  // Ambiguous cases (both <= 12) default to DD/MM above

  // Fallback: native parser
  const parsed = new Date(v);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];

  return null;
}

// ── Money Parsing ────────────────────────────────────────────────────────────

const SUFFIXES: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

/**
 * Parse money values: strips $, GYD, commas. Handles "1.5M", "45B", "200K".
 */
export function parseMoneyValue(value: string): number | null {
  const v = value.trim();
  if (!v) return null;

  // Strip currency symbols and labels
  const cleaned = v.replace(/[$,\s]|gyd/gi, '');

  // Check for suffix multiplier
  const suffixMatch = cleaned.match(/^([0-9.]+)\s*([kmb])$/i);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const mult = SUFFIXES[suffixMatch[2].toLowerCase()];
    return isNaN(num) ? null : num * mult;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Status Inference ─────────────────────────────────────────────────────────

const CANCEL_TERMS = ['annulled', 'cancelled', 'canceled', 'withdrawn', 'void'];
const AWARD_TERMS = ['awarded', 'award'];
const APPROVE_TERMS = ['approved', 'no objection', 'no-objection'];

/**
 * Infer a procurement status from a remarks/notes string.
 * Returns a normalized status or the provided default.
 */
export function inferStatus(
  remarks: string,
  defaultStatus: string,
): string {
  const lower = remarks.toLowerCase();

  for (const term of CANCEL_TERMS) {
    if (lower.includes(term)) return 'cancelled';
  }
  for (const term of AWARD_TERMS) {
    if (lower.includes(term)) return 'awarded';
  }
  for (const term of APPROVE_TERMS) {
    if (lower.includes(term)) return 'approved';
  }

  return defaultStatus;
}

// ── Text Cleaning ────────────────────────────────────────────────────────────

/**
 * Trim and collapse whitespace in a text field.
 */
export function cleanTextField(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Alias — trim and collapse whitespace, preserving original casing. */
export const normalizeBidReference = cleanTextField;
