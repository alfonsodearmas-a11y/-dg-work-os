/**
 * The Intel Brief — volume + issue number derivation.
 *
 * Stateless. The Brief is a serialized publication for the Director General;
 * Vol/No are computed from the generation date, not stored in a counter
 * table. Launch year is fixed at 2024, the year DG Work OS began taking shape;
 * choosing it (over 2026) gives the publication editorial weight without
 * fabricating history.
 *
 * Format produced by `formatIssueLine`:
 *   Vol. 3 . No. 19 . 07 May 2026
 * with U+00B7 middle-dot separators between the three parts.
 */

const LAUNCH_YEAR = 2024;
const MIDDLE_DOT = '·';

export interface BriefIssue {
  vol: number;
  no: number;
  /** "07 May 2026" — masthead style: zero-padded day, full month name, four-digit year, no comma. */
  formattedDate: string;
}

/**
 * ISO 8601 week number (1 to 53). Thursday-anchored. Matches the rule used
 * by ICU / date-fns / postgres `EXTRACT(WEEK FROM ...)` so back-end and
 * front-end never disagree about which Monday begins which week.
 */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Masthead date: "07 May 2026". Zero-padded day, full month, four-digit year. */
export function formatMastheadDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function computeIssue(date: Date = new Date()): BriefIssue {
  const vol = Math.max(1, date.getUTCFullYear() - LAUNCH_YEAR + 1);
  const no = isoWeek(date);
  return { vol, no, formattedDate: formatMastheadDate(date) };
}

/** Render the masthead's volume/issue line. */
export function formatIssueLine(issue: BriefIssue): string {
  return `Vol. ${issue.vol} ${MIDDLE_DOT} No. ${issue.no} ${MIDDLE_DOT} ${issue.formattedDate}`;
}
