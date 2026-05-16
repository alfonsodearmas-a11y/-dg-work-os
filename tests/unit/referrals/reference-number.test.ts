import { describe, it, expect } from 'vitest';
import { formatReferenceNumber, guyanaYearOf } from '@/lib/referrals/reference-number';

describe('formatReferenceNumber', () => {
  it('zero-pads to 4 digits', () => {
    expect(formatReferenceNumber(1, 2026)).toBe('MPUA-MR-2026-0001');
    expect(formatReferenceNumber(42, 2026)).toBe('MPUA-MR-2026-0042');
    expect(formatReferenceNumber(9999, 2026)).toBe('MPUA-MR-2026-9999');
  });

  it('does not truncate beyond 9999', () => {
    expect(formatReferenceNumber(12345, 2027)).toBe('MPUA-MR-2027-12345');
  });
});

describe('guyanaYearOf', () => {
  it('returns Guyana local year — late evening 31 Dec UTC is still that year in Guyana', () => {
    // 2026-12-31T23:30:00Z is 19:30 in Guyana — still 2026
    expect(guyanaYearOf(new Date('2026-12-31T23:30:00Z'))).toBe(2026);
  });

  it('early hours 1 Jan UTC is still previous year in Guyana', () => {
    // 2027-01-01T03:30:00Z is 23:30 on 31 Dec 2026 in Guyana — still 2026
    expect(guyanaYearOf(new Date('2027-01-01T03:30:00Z'))).toBe(2026);
  });

  it('rolls to new year once it is past midnight in Guyana', () => {
    // 2027-01-01T04:30:00Z is 00:30 on 1 Jan 2027 in Guyana
    expect(guyanaYearOf(new Date('2027-01-01T04:30:00Z'))).toBe(2027);
  });
});
