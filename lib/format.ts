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

/** Format a number with locale-aware thousands separators, or '-' if falsy. */
export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
}
