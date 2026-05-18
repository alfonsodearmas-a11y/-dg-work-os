import { describe, it, expect } from 'vitest';
import { buildAggregates } from '@/lib/nptab/aggregate';
import type { NptabReportTenderSnapshot } from '@/lib/nptab/types';

const mk = (over: Partial<NptabReportTenderSnapshot> = {}): NptabReportTenderSnapshot => ({
  tender_id: 't', title: 'x', agency: 'GPL', contract_value: 0,
  days_past_sla: 0, contractor: null, status: 'evaluation', ...over,
});

describe('buildAggregates — byAgency', () => {
  it('groups by agency with count and total_value, sorted by count desc', () => {
    const r = buildAggregates([
      mk({ agency: 'GPL', contract_value: 5_000_000 }),
      mk({ agency: 'GPL', contract_value: 15_000_000 }),
      mk({ agency: 'GWI', contract_value: 7_000_000 }),
    ]);
    expect(r.byAgency).toEqual([
      { agency: 'GPL', count: 2, total_value: 20_000_000 },
      { agency: 'GWI', count: 1, total_value: 7_000_000 },
    ]);
  });
});

describe('buildAggregates — byValueBracket', () => {
  it('buckets by value (left-inclusive, right-exclusive except 200M+)', () => {
    const r = buildAggregates([
      mk({ contract_value: 5_000_000 }),
      mk({ contract_value: 25_000_000 }),
      mk({ contract_value: 100_000_000 }),
      mk({ contract_value: 500_000_000 }),
    ]);
    expect(r.byValueBracket.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });

  it('treats null contract_value as 0 (< 10M bucket)', () => {
    const r = buildAggregates([mk({ contract_value: null })]);
    expect(r.byValueBracket[0].count).toBe(1);
    expect(r.byValueBracket[0].total_value).toBe(0);
  });
});

describe('buildAggregates — byContractor', () => {
  it('only includes contractors with 2+ tenders', () => {
    const r = buildAggregates([
      mk({ contractor: 'Acme',  contract_value: 10 }),
      mk({ contractor: 'Acme',  contract_value: 20 }),
      mk({ contractor: 'Bravo', contract_value: 5 }),
    ]);
    expect(r.byContractor).toHaveLength(1);
    expect(r.byContractor[0]).toEqual({ contractor: 'Acme', count: 2, total_value: 30 });
  });

  it('sorts contractors by total_value desc', () => {
    const r = buildAggregates([
      mk({ contractor: 'Acme',  contract_value: 50 }),
      mk({ contractor: 'Acme',  contract_value: 50 }),
      mk({ contractor: 'Bravo', contract_value: 200 }),
      mk({ contractor: 'Bravo', contract_value: 200 }),
    ]);
    expect(r.byContractor[0].contractor).toBe('Bravo');
  });
});
