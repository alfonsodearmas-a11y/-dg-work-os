import { describe, it, expect } from 'vitest';
import { fmtCurrency, fmtBudgetAmount, fmtDate, fmtNumber } from '@/lib/format';

describe('fmtCurrency', () => {
  it('formats billions', () => {
    expect(fmtCurrency(2_500_000_000)).toBe('$2.5B');
  });

  it('formats millions', () => {
    expect(fmtCurrency(1_200_000)).toBe('$1.2M');
  });

  it('formats thousands', () => {
    expect(fmtCurrency(45_000)).toBe('$45.0K');
  });

  it('formats small numbers without suffix', () => {
    expect(fmtCurrency(500)).toBe('$500');
  });

  it('returns dash for null', () => {
    expect(fmtCurrency(null)).toBe('-');
  });

  it('returns dash for undefined', () => {
    expect(fmtCurrency(undefined)).toBe('-');
  });

  it('returns dash for zero', () => {
    expect(fmtCurrency(0)).toBe('-');
  });

  it('returns dash for negative numbers', () => {
    expect(fmtCurrency(-500)).toBe('-');
  });

  it('returns dash for values over 1e11', () => {
    expect(fmtCurrency(200_000_000_000)).toBe('-');
  });

  it('returns dash for dash string', () => {
    expect(fmtCurrency('-')).toBe('-');
  });

  it('parses string with $ and commas', () => {
    expect(fmtCurrency('$1,200,000')).toBe('$1.2M');
  });

  it('returns dash for non-numeric string', () => {
    expect(fmtCurrency('abc')).toBe('-');
  });

  it('handles boundary at exactly 1e11', () => {
    expect(fmtCurrency(100_000_000_000)).toBe('$100.0B');
  });
});

describe('fmtBudgetAmount', () => {
  it('returns em dash for null', () => {
    expect(fmtBudgetAmount(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(fmtBudgetAmount(undefined)).toBe('—');
  });

  it('returns em dash for zero', () => {
    expect(fmtBudgetAmount(0)).toBe('—');
  });

  it('formats millions as billions in Guyanese convention', () => {
    expect(fmtBudgetAmount(5_000_000)).toBe('G$5.00B');
  });

  it('formats thousands as millions in Guyanese convention', () => {
    expect(fmtBudgetAmount(1_500)).toBe('G$1.50M');
  });

  it('formats small values as K', () => {
    expect(fmtBudgetAmount(250)).toBe('G$250K');
  });

  it('formats negative values with sign prefix', () => {
    expect(fmtBudgetAmount(-2_000_000)).toBe('-G$2.00B');
  });
});

describe('fmtDate', () => {
  it('formats date string in short format', () => {
    const result = fmtDate('2026-01-24');
    expect(result).toMatch(/24/);
    expect(result).toMatch(/2026/);
  });

  it('formats date string in long format', () => {
    const result = fmtDate('2026-01-24', 'long');
    expect(result).toMatch(/January/);
  });

  it('formats ISO datetime string', () => {
    const result = fmtDate('2026-01-24T14:30:00Z');
    expect(result).toMatch(/24/);
  });

  it('returns dash for null', () => {
    expect(fmtDate(null)).toBe('-');
  });

  it('returns dash for empty string', () => {
    expect(fmtDate('')).toBe('-');
  });

  it('returns dash for invalid date', () => {
    expect(fmtDate('not-a-date')).toBe('-');
  });

  it('short format uses abbreviated month', () => {
    const result = fmtDate('2026-01-24', 'short');
    expect(result).toMatch(/Jan/);
  });
});

describe('fmtNumber', () => {
  it('formats positive integer with separators', () => {
    expect(fmtNumber(1234567)).toBe((1234567).toLocaleString());
  });

  it('formats float', () => {
    expect(fmtNumber(1234.56)).toBe((1234.56).toLocaleString());
  });

  it('formats negative number', () => {
    expect(fmtNumber(-500)).toBe((-500).toLocaleString());
  });

  it('returns dash for null', () => {
    expect(fmtNumber(null)).toBe('-');
  });

  it('returns dash for undefined', () => {
    expect(fmtNumber(undefined)).toBe('-');
  });

  it('formats zero', () => {
    expect(fmtNumber(0)).toBe('0');
  });

  it('formats NaN', () => {
    expect(fmtNumber(NaN)).toBe('NaN');
  });

  it('formats Infinity', () => {
    expect(fmtNumber(Infinity)).toBe('∞');
  });

  it('formats large number', () => {
    expect(fmtNumber(999999999)).toBe((999999999).toLocaleString());
  });
});
