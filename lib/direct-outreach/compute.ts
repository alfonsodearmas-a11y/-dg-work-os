// Direct Outreach — pure derivation helpers. No I/O, no server imports; safe
// for client and server. Aging (days_open / days_idle / age_bucket) is NOT
// computed here — it lives in the direct_outreach_open_v view so it stays
// now()-relative instead of freezing at sync time.

import type { ExtractedTargetDate, OutreachTheme, PriorityFlag } from './types';

/** OP Direct priority is an int; anything non-zero is treated as elevated. */
export function priorityFlag(priority: number | null | undefined): PriorityFlag {
  return priority ? 'Elevated' : 'Normal';
}

// ── Theme classification ──────────────────────────────────────────────────────

const BILLING_RE =
  /\bbill(?:s|ing|ed)?\b|arrears|subsid(?:y|ies|ised|ized)|tariff|overcharg|over-?bill|payment plan|write-?off|refund/;
const TELECOMS_RE =
  /telecom|\bgtt\b|digicel|internet|broadband|landline|mobile network|phone (?:line|signal|service)|cell(?:phone| phone| service)/;
// Bare "road" appears in almost every address ("on the main road"), so the road
// tier requires works-context wording; airstrip/ferry/etc. are unambiguous.
const AVIATION_TRANSPORT_RE =
  /airstrip|airport|aviation|\bflights?\b|runway|ferry|stelling|wharf|bridge|culvert|transportation|\btransport\b|roads?\b[^.]{0,40}(?:repair|rehab|construct|upgrad|impassable|deplorable|deteriorat|bad condition|pothole)|(?:repair|rehab|construct|upgrad|fix)[^.]{0,40}\broads?\b/;
const METER_RE = /\bmeters?\b/;
const WATER_INFRA_RE =
  /pipeline|water main|burst|\bleak(?:s|ing|age)?\b|\bpipes?\b|\bpumps?\b|\bwells?\b|trestle|treatment plant|sewer|sewage|turbid|discolou?r|contaminat|water quality|salty|brackish/;
const WATER_SUPPLY_RE =
  /no water|without water|low (?:water )?pressure|water (?:supply|service|connection|access)|potable|access to water/;
const ELEC_INFRA_RE =
  /transformer|\bpoles?\b|power line|street ?light|substation|\bgrid\b|electrif|voltage|\bwir(?:e|es|ing)\b|\bcables?\b|line (?:extension|upgrade)/;
const ELEC_SUPPLY_RE =
  /no (?:power|electricity|current)|blackout|outage|power (?:supply|cut|fluctuat)|electricity (?:supply|connection)|lights? (?:out|off)|connection to (?:power|electricity)/;

/**
 * Keyword-regex theme classification over the case description + category, with
 * an agency fallback when no keyword tier matches. Deliberately heuristic —
 * the UI labels themes as derived, not authoritative.
 */
export function classifyTheme(
  description: string | null | undefined,
  category: string | null | undefined,
  agency: string | null | undefined,
): OutreachTheme {
  const t = `${description ?? ''} ${category ?? ''}`.toLowerCase();
  const ag = (agency ?? '').toUpperCase();

  if (BILLING_RE.test(t)) return 'Billing-Subsidy';
  if (TELECOMS_RE.test(t)) return 'Telecoms';
  if (AVIATION_TRANSPORT_RE.test(t)) return 'Aviation-Transport';
  // Meters exist on both networks — disambiguate by agency.
  if (METER_RE.test(t)) {
    return ag === 'GWI' ? 'Water-Infrastructure/Quality' : 'Electricity-Infrastructure';
  }
  if (WATER_INFRA_RE.test(t)) return 'Water-Infrastructure/Quality';
  if (WATER_SUPPLY_RE.test(t)) return 'Water-Supply';
  if (ELEC_INFRA_RE.test(t)) return 'Electricity-Infrastructure';
  if (ELEC_SUPPLY_RE.test(t)) return 'Electricity-Supply';

  if (ag === 'GWI') return 'Water-Supply';
  if (ag === 'GPL') return 'Electricity-Supply';
  return 'Other';
}

// ── Substantive-comment filter ────────────────────────────────────────────────

const NON_SUBSTANTIVE = new Set(['', '.', 'case created', 'case created via tablet', 'category updated']);

/** System stubs ('case created', 'category updated', …) are not real updates. */
export function isSubstantive(comment: string | null | undefined): boolean {
  if (comment == null) return false;
  return !NON_SUBSTANTIVE.has(comment.trim().toLowerCase());
}

// ── Target-date extraction ────────────────────────────────────────────────────

const MONTH_PART =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const YEAR_PART = '(20\\d{2})';

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const QUARTER_WORDS: Record<string, number> = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: 4,
};

// Ordered most-specific → least-specific; the first match wins.
const DAY_RE = new RegExp(`\\b${MONTH_PART}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*${YEAR_PART}\\b`, 'i');
const MONTH_RANGE_RE = new RegExp(`\\b${MONTH_PART}\\s*/\\s*${MONTH_PART}\\s*,?\\s*${YEAR_PART}\\b`, 'i');
const QUARTER_RE = new RegExp(`\\bq([1-4])\\s*,?\\s*${YEAR_PART}\\b`, 'i');
const QUARTER_WORD_RE = new RegExp(
  `\\b(first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+quarter\\s+(?:of\\s+)?${YEAR_PART}\\b`,
  'i',
);
const MONTH_RE = new RegExp(`\\b${MONTH_PART}\\s*,?\\s+${YEAR_PART}\\b`, 'i');
const YEAR_END_RE = new RegExp(`\\bend\\s+(?:of\\s+)?${YEAR_PART}\\b`, 'i');

function monthIndex(name: string): number {
  return MONTH_INDEX[name.slice(0, 3).toLowerCase()];
}

function iso(year: number, monthIdx: number, day: number): string {
  const m = String(monthIdx + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Last calendar day of a (year, 0-based month). */
function endOfMonth(year: number, monthIdx: number): string {
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  return iso(year, monthIdx, lastDay);
}

const QUARTER_END: Record<number, [number, number]> = {
  1: [2, 31], 2: [5, 30], 3: [8, 30], 4: [11, 31],
};

/**
 * Heuristic completion/target-date extraction from a comment. Recognises, in
 * order of specificity: "June 15, 2026" · "June/July 2026" · "Q3 2026" /
 * "first quarter of 2026" · "June 2026" · "end (of) 2026". Range-like patterns
 * resolve to the end of the period. Returns null when nothing matches — the UI
 * labels any hit as heuristic ("verify").
 */
export function extractTargetDate(text: string | null | undefined): ExtractedTargetDate | null {
  if (!text) return null;

  const day = DAY_RE.exec(text);
  if (day) {
    const mIdx = monthIndex(day[1]);
    const d = parseInt(day[2], 10);
    const y = parseInt(day[3], 10);
    const lastDay = new Date(Date.UTC(y, mIdx + 1, 0)).getUTCDate();
    if (d >= 1 && d <= lastDay) {
      return { date: iso(y, mIdx, d), type: 'day', matched: day[0] };
    }
  }

  const range = MONTH_RANGE_RE.exec(text);
  if (range) {
    const y = parseInt(range[3], 10);
    return { date: endOfMonth(y, monthIndex(range[2])), type: 'month-range', matched: range[0] };
  }

  const q = QUARTER_RE.exec(text);
  if (q) {
    const [mIdx, d] = QUARTER_END[parseInt(q[1], 10)];
    return { date: iso(parseInt(q[2], 10), mIdx, d), type: 'quarter', matched: q[0] };
  }

  const qw = QUARTER_WORD_RE.exec(text);
  if (qw) {
    const [mIdx, d] = QUARTER_END[QUARTER_WORDS[qw[1].toLowerCase()]];
    return { date: iso(parseInt(qw[2], 10), mIdx, d), type: 'quarter', matched: qw[0] };
  }

  const month = MONTH_RE.exec(text);
  if (month) {
    const y = parseInt(month[2], 10);
    return { date: endOfMonth(y, monthIndex(month[1])), type: 'month', matched: month[0] };
  }

  const yearEnd = YEAR_END_RE.exec(text);
  if (yearEnd) {
    return { date: `${yearEnd[1]}-12-31`, type: 'year-end', matched: yearEnd[0] };
  }

  return null;
}
