import { describe, expect, test } from 'vitest';
import { extractOutreachRegion, sortRegions } from './region';

// The OP Direct workbook has no dedicated region column; the region is embedded
// as free text in outreach_location. These cases are taken verbatim from the
// live dataset (both numeric and spelled-out forms, plus location-only rows).
describe('extractOutreachRegion', () => {
  test('numeric form → canonical "Region N"', () => {
    expect(extractOutreachRegion('Region 6')).toBe('Region 6');
    expect(extractOutreachRegion('Region 10')).toBe('Region 10');
    expect(extractOutreachRegion('Region 3: Hyronie Market Tarmac')).toBe('Region 3');
    expect(extractOutreachRegion('Region 6: New Amsterdam')).toBe('Region 6');
  });

  test('spelled-out form → the same canonical "Region N"', () => {
    expect(extractOutreachRegion('Region Three: Cabinet Outreach')).toBe('Region 3');
    expect(extractOutreachRegion('Region Four: Cabinet Outreach, East Bank')).toBe('Region 4');
    expect(extractOutreachRegion('Region Six: Berbice Outreach - VP')).toBe('Region 6');
    expect(extractOutreachRegion('Region Ten')).toBe('Region 10');
  });

  test('case-insensitive', () => {
    expect(extractOutreachRegion('REGION 5')).toBe('Region 5');
    expect(extractOutreachRegion('region seven — outreach')).toBe('Region 7');
  });

  test('location-only rows (no region mention) → null', () => {
    expect(extractOutreachRegion('Bartica - Cabinet Outreach')).toBeNull();
    expect(extractOutreachRegion('Anna Regina - Cabinet Outreach')).toBeNull(); // "Regina" ≠ "Region"
    expect(extractOutreachRegion('Freedom House')).toBeNull();
    expect(extractOutreachRegion('VP Essequibo')).toBeNull();
  });

  test('out-of-range / malformed numbers → null (Guyana has 10 regions)', () => {
    expect(extractOutreachRegion('Region 15')).toBeNull();
    expect(extractOutreachRegion('Region 0')).toBeNull();
  });

  test('nullish input → null', () => {
    expect(extractOutreachRegion(null)).toBeNull();
    expect(extractOutreachRegion(undefined)).toBeNull();
    expect(extractOutreachRegion('')).toBeNull();
  });
});

describe('sortRegions', () => {
  test('natural numeric order (Region 2 before Region 10, not lexical)', () => {
    expect(sortRegions(['Region 10', 'Region 2', 'Region 1'])).toEqual([
      'Region 1',
      'Region 2',
      'Region 10',
    ]);
  });

  test('dedupes', () => {
    expect(sortRegions(['Region 3', 'Region 3', 'Region 1'])).toEqual(['Region 1', 'Region 3']);
  });
});
