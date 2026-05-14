// Number and date formatters shared across the bento intel surface.

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function formatDelta(delta: number | null): string {
  if (delta == null) return '—';
  return `${Math.abs(delta).toFixed(0)}%`;
}

// Render an ISO date (YYYY-MM-DD) as "Apr 13" when same calendar year as
// `now`, otherwise "Apr 13, 2025". Returns the original string for any value
// that fails to parse so a malformed cell doesn't render an empty span.
export function formatHumanDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return '';
  const trimmed = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  const month = parsed.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = parsed.getUTCDate();
  const sameYear = parsed.getUTCFullYear() === now.getUTCFullYear();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${parsed.getUTCFullYear()}`;
}
