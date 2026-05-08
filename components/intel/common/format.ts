// Number formatters used across the bento intel surface. Single source so
// the home briefing, agency bento, and any future surface stay consistent.

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function formatDelta(delta: number | null): string {
  if (delta == null) return '—';
  return `${Math.abs(delta).toFixed(0)}%`;
}
