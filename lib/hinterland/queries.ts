// Server-side helpers for the Hinterland Communities module. Keeps summary
// aggregation in one place so the list route (and any future surface) never
// drifts. Mirrors lib/airstrips/queries.ts.

import { WATER_STATUSES } from '@/lib/hinterland-types';
import type {
  CommunityListRow,
  CommunitySummary,
  RegionSummary,
  WaterStatusValue,
} from '@/lib/hinterland-types';

/** A fresh zeroed count map keyed by every water status. */
export function emptyStatusCounts(): Record<WaterStatusValue, number> {
  return Object.fromEntries(WATER_STATUSES.map(s => [s, 0])) as Record<WaterStatusValue, number>;
}

/** Mean of the non-null coverage values, rounded to a whole percent, or null. */
function avgCoverage(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/**
 * Single-pass estate summary from the full community list: counts by status,
 * by region, average coverage, airstrip-linked count, and a per-region rollup
 * (count + status breakdown + avg coverage) that stands in for the map until
 * communities are geocoded.
 */
export function buildCommunitySummary(rows: CommunityListRow[]): CommunitySummary {
  const by_status = emptyStatusCounts();
  const by_region: Record<number, number> = {};
  const regionAgg = new Map<number, { total: number; by_status: Record<WaterStatusValue, number>; coverage: (number | null)[] }>();
  let with_airstrip = 0;

  for (const r of rows) {
    by_status[r.water_status]++;
    by_region[r.region] = (by_region[r.region] ?? 0) + 1;
    if (r.has_airstrip) with_airstrip++;

    let agg = regionAgg.get(r.region);
    if (!agg) {
      agg = { total: 0, by_status: emptyStatusCounts(), coverage: [] };
      regionAgg.set(r.region, agg);
    }
    agg.total++;
    agg.by_status[r.water_status]++;
    agg.coverage.push(r.coverage_percent);
  }

  const regions: RegionSummary[] = [...regionAgg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([region, agg]) => ({
      region,
      total: agg.total,
      by_status: agg.by_status,
      avg_coverage: avgCoverage(agg.coverage),
    }));

  return {
    total: rows.length,
    by_status,
    by_region,
    avg_coverage: avgCoverage(rows.map(r => r.coverage_percent)),
    with_airstrip,
    regions,
  };
}
