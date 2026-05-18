import { describe, it, expect } from 'vitest';
import { quarterOf, periodToDates, periodLabel, nextQuarterEnd } from '@/lib/nptab/period';

describe('quarterOf', () => {
  it('maps months to quarters via Guyana TZ', () => {
    expect(quarterOf(new Date('2026-01-15T12:00:00Z')).quarter).toBe(1);
    expect(quarterOf(new Date('2026-04-15T12:00:00Z')).quarter).toBe(2);
    expect(quarterOf(new Date('2026-07-15T12:00:00Z')).quarter).toBe(3);
    expect(quarterOf(new Date('2026-10-15T12:00:00Z')).quarter).toBe(4);
  });

  it('handles the Guyana year boundary', () => {
    // 2027-01-01T03:30:00Z is 23:30 on 31 Dec 2026 in Guyana
    const r = quarterOf(new Date('2027-01-01T03:30:00Z'));
    expect(r.year).toBe(2026);
    expect(r.quarter).toBe(4);
  });

  it('rolls into the new year once it is past midnight in Guyana', () => {
    const r = quarterOf(new Date('2027-01-01T04:30:00Z'));
    expect(r.year).toBe(2027);
    expect(r.quarter).toBe(1);
  });
});

describe('periodToDates', () => {
  it('returns correct boundaries per quarter', () => {
    expect(periodToDates(2026, 1)).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(periodToDates(2026, 2)).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(periodToDates(2026, 3)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(periodToDates(2026, 4)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
  });

  it('respects leap-year February for Q1', () => {
    expect(periodToDates(2028, 1).end).toBe('2028-03-31');
  });
});

describe('periodLabel', () => {
  it('formats single-year quarters as Q? YYYY', () => {
    expect(periodLabel('2026-04-01', '2026-06-30')).toBe('Q2 2026');
    expect(periodLabel('2026-10-01', '2026-12-31')).toBe('Q4 2026');
  });

  it('falls back to a date range for cross-year periods', () => {
    expect(periodLabel('2026-11-01', '2027-02-01')).toBe('2026-11-01 to 2027-02-01');
  });
});

describe('nextQuarterEnd', () => {
  it('returns the current quarter end based on Guyana TZ', () => {
    const r = nextQuarterEnd(new Date('2026-05-17T12:00:00Z'));
    expect(r.quarter).toBe(2);
    expect(r.end).toBe('2026-06-30');
  });
});
