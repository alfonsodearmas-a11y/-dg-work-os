/**
 * GPL station / unit derated-capacity utilities — used by the Station Health
 * Summary section on /intel/gpl.
 *
 * Rule: a station is "critical" when it operates below 50% of its derated
 * capacity.
 */

export type StationStatus = 'healthy' | 'degraded' | 'critical';

export const DERATED_HEALTHY_PCT = 80;
export const DERATED_CRITICAL_PCT = 50;

/**
 * Compute available-vs-derated as a percentage. Returns null when the
 * derated capacity is missing or zero (degenerate input — caller decides
 * whether to render "—" or fall back to a status of "unknown").
 */
export function deratedPct(
  available_mw: number | null | undefined,
  derated_capacity_mw: number | null | undefined,
): number | null {
  if (
    available_mw == null ||
    derated_capacity_mw == null ||
    derated_capacity_mw <= 0
  ) {
    return null;
  }
  return (available_mw / derated_capacity_mw) * 100;
}

export function classifyStation(pct: number | null): StationStatus | 'unknown' {
  if (pct == null) return 'unknown';
  if (pct >= DERATED_HEALTHY_PCT) return 'healthy';
  if (pct >= DERATED_CRITICAL_PCT) return 'degraded';
  return 'critical';
}
