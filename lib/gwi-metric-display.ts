/**
 * GWI Metric Display Utilities
 *
 * Shared formatters and status-aware rendering helpers for GWI domain cards.
 * Replaces ambiguous "--" with contextual status text.
 */

import type { MetaEntry } from '@/lib/gwi-report-merge';

// ── Types ───────────────────────────────────────────────────────────────────

export type MetricStatus = 'value' | 'not_reported' | 'pending' | 'error';

export interface MetricDisplay {
  text: string;
  status: MetricStatus;
  estimated: boolean;
  tooltip: string | null;
}

// ── Formatters ──────────────────────────────────────────────────────────────

/** Format GYD currency. Returns "N/R" for null/NaN (replaces "--"). */
export function formatGYD(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return 'N/R';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Format number with locale separators. Returns "N/R" for null/NaN. */
export function formatNum(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return 'N/R';
  return value.toLocaleString();
}

/** Format percentage. Returns "N/R" for null/NaN. */
export function formatPct(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return 'N/R';
  return `${value.toFixed(1)}%`;
}

/** Type predicate: does a value have actual numeric data? Narrows to `number`. */
export function hasValue(value: number | undefined | null): value is number {
  return value != null && !isNaN(value as number);
}

// ── Status-aware display (for financial data with _meta) ────────────────────

const SOURCE_LABELS: Record<string, string> = {
  computed: 'Computed from components',
  cscr_billings_fallback: 'From CSCR billings data',
  gog_funded_fallback: 'From procurement GoG funding',
};

/**
 * Resolve the display value + status for a metric with _meta tracking.
 * Used by the Financial domain which has source-tracking metadata.
 */
export function resolveMetric(
  value: number | undefined | null,
  formatter: (v: number | undefined | null) => string,
  field?: string,
  meta?: Record<string, MetaEntry>,
): MetricDisplay {
  const entry = field ? meta?.[field] : undefined;

  // Explicit missing from meta — check if it's an error or just not reported
  if (entry?.source === 'missing') {
    const isError = entry.reason?.toLowerCase().includes('error') ||
                    entry.reason?.toLowerCase().includes('parse fail');
    if (isError) {
      return {
        text: 'Error',
        status: 'error',
        estimated: false,
        tooltip: entry.reason || 'Parsing error',
      };
    }
    return {
      text: 'N/R',
      status: 'not_reported',
      estimated: false,
      tooltip: entry.reason || 'Not found in uploaded reports',
    };
  }

  // Null/undefined value with no meta
  if (value == null || isNaN(value as number)) {
    return {
      text: 'N/R',
      status: 'not_reported',
      estimated: false,
      tooltip: 'Not reported in source documents',
    };
  }

  // Value exists — check if it's a fallback/computed source
  const isFallback = entry?.source != null && entry.source !== 'extracted';
  const formatted = formatter(value);

  return {
    text: isFallback ? `~${formatted}` : formatted,
    status: 'value',
    estimated: isFallback,
    tooltip: isFallback ? SOURCE_LABELS[entry!.source] || null : null,
  };
}
