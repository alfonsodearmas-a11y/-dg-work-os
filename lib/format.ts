/**
 * Shared formatting utilities for currency, dates, and numbers.
 */

/** Format a project/general currency value with K/M/B suffixes. Accepts number or string. */
export function fmtCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num) || num <= 0) return '-';
  if (num > 1e11) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

/** Format a budget amount in Guyanese dollars with G$ prefix and B/M/K suffixes. */
export function fmtBudgetAmount(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '—';
  const sign = val < 0 ? '-' : '';
  const v = Math.abs(val);
  if (v >= 1_000_000) return `${sign}G$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `${sign}G$${(v / 1_000).toFixed(2)}M`;
  return `${sign}G$${v.toLocaleString()}K`;
}

/**
 * Format an ISO date string for display.
 * @param format - 'long' for "24 January 2026", 'short' for "24 Jan 2026"
 */
export function fmtDate(iso: string | null, format: 'long' | 'short' = 'short'): string {
  if (!iso) return '-';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: format === 'long' ? 'long' : 'short',
    year: 'numeric',
  });
}

/** Parse a date-only string (YYYY-MM-DD) safely in local timezone. */
export function safeDateParse(dateString: string): Date {
  return new Date(dateString + (dateString.includes('T') ? '' : 'T00:00:00'));
}

/** Format a number with locale-aware thousands separators, or '-' if falsy. */
export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
}

/** Format an ISO timestamp as a relative time string (e.g. "5m ago", "3d ago"). Falls back to fmtDate for >7 days. */
export function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

/** Format a file size in bytes to a human-readable string (B / KB / MB). */
export function fmtFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format a date or ISO timestamp in Guyana local time. */
export function fmtGuyanaDate(
  iso: string | null | undefined,
  format: 'long' | 'short' = 'short',
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guyana',
    day: 'numeric',
    month: format === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(d);
}

/** Format a timestamp with date + HH:MM in Guyana local time. */
export function fmtGuyanaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guyana',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Truncate with single-char ellipsis. Trailing punctuation/whitespace is stripped first. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/[\s.,;:!?]+$/, '') + '…';
}
