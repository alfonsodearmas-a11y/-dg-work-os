import { describe, it, expect } from 'vitest';
import { formatNptabReferenceNumber, guyanaYearOf } from '@/lib/nptab/reference-number';

describe('formatNptabReferenceNumber', () => {
  it('zero-pads to 4 digits', () => {
    expect(formatNptabReferenceNumber(1, 2026)).toBe('MPUA-NPTAB-2026-0001');
    expect(formatNptabReferenceNumber(42, 2026)).toBe('MPUA-NPTAB-2026-0042');
    expect(formatNptabReferenceNumber(9999, 2026)).toBe('MPUA-NPTAB-2026-9999');
  });

  it('does not truncate beyond 9999', () => {
    expect(formatNptabReferenceNumber(12345, 2027)).toBe('MPUA-NPTAB-2027-12345');
  });
});

describe('guyanaYearOf', () => {
  it('uses the Guyana local year, not UTC', () => {
    // 2027-01-01T03:30:00Z is 23:30 on 31 Dec 2026 in Guyana
    expect(guyanaYearOf(new Date('2027-01-01T03:30:00Z'))).toBe(2026);
    expect(guyanaYearOf(new Date('2027-01-01T04:30:00Z'))).toBe(2027);
  });
});
