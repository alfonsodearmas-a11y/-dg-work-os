import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the raw-SQL layer so getSummary runs against canned rows. vi.hoisted lets
// the mock factory reference the spy without TDZ issues.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db-pg', () => ({ query, transaction: vi.fn() }));

import { getSummary } from './queries';

beforeEach(() => {
  query.mockReset();
});

describe('getSummary — region filter options', () => {
  test('read from the populated region column, deduped and naturally sorted', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('DISTINCT v.region')) {
        // The column read must be the region column (not a derived expression)…
        expect(sql).toContain('v.region IS NOT NULL');
        // …and the DB hands them back lexically (Region 10 before Region 2).
        return { rows: [{ region: 'Region 10' }, { region: 'Region 2' }, { region: 'Region 1' }] };
      }
      return { rows: [] };
    });

    const summary = await getSummary();

    expect(summary.filter_options.regions).toEqual(['Region 1', 'Region 2', 'Region 10']);
    expect(summary.filter_options.regions.length).toBeGreaterThan(0);
  });

  test('empty when no case names a region', async () => {
    query.mockResolvedValue({ rows: [] });
    const summary = await getSummary();
    expect(summary.filter_options.regions).toEqual([]);
  });
});

describe('getSummary — pooler pressure', () => {
  // The Supabase pooler runs in SESSION mode (pool_size 15, shared). A parallel
  // fan-out of every summary query exhausted it under concurrent dashboard loads
  // (EMAXCONNSESSION / connection timeout). The reads must run sequentially so
  // this endpoint holds at most one pooled connection at a time.
  test('runs its reads sequentially — never more than one query in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    query.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return { rows: [] };
    });

    await getSummary();

    expect(maxInFlight).toBe(1);
  });
});
