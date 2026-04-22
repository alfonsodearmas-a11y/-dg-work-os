import { describe, it, expect } from 'vitest';
import {
  diffTenderSnapshots,
  buildTenderSnapshot,
  normalizeDateLike,
  SNAPSHOT_FIELDS,
  type TenderSnapshot,
} from '@/lib/tender/freshness';

function emptyRow() {
  return {
    stage: 'advertised',
    date_advertised: '2026-03-01',
    date_closed: null,
    date_eval_sent_mtb_rtb: null,
    date_eval_sent_nptab: null,
    date_of_award: null,
    contractor: 'Acme',
    implementation_status_pct: 40,
    implementation_start_date: null,
    implementation_end_date: null,
    remarks: null,
  };
}

describe('diffTenderSnapshots — unchanged detection', () => {
  it('flags identical snapshots as unchanged', () => {
    const snap = buildTenderSnapshot(emptyRow());
    const { changed, changedFields } = diffTenderSnapshots(snap, snap);
    expect(changed).toBe(false);
    expect(changedFields).toEqual([]);
  });

  it('flags stage change as changed', () => {
    const prev = buildTenderSnapshot(emptyRow());
    const curr = buildTenderSnapshot({ ...emptyRow(), stage: 'evaluation' });
    const { changed, changedFields } = diffTenderSnapshots(curr, prev);
    expect(changed).toBe(true);
    expect(changedFields).toEqual(['stage']);
  });

  it('flags date change as changed', () => {
    const prev = buildTenderSnapshot(emptyRow());
    const curr = buildTenderSnapshot({ ...emptyRow(), date_advertised: '2026-03-02' });
    const { changed, changedFields } = diffTenderSnapshots(curr, prev);
    expect(changed).toBe(true);
    expect(changedFields).toEqual(['date_advertised']);
  });

  it('flags contractor change', () => {
    const prev = buildTenderSnapshot(emptyRow());
    const curr = buildTenderSnapshot({ ...emptyRow(), contractor: 'Beta' });
    const { changed, changedFields } = diffTenderSnapshots(curr, prev);
    expect(changed).toBe(true);
    expect(changedFields).toEqual(['contractor']);
  });

  it('flags remarks change', () => {
    const prev = buildTenderSnapshot(emptyRow());
    const curr = buildTenderSnapshot({ ...emptyRow(), remarks: 'Delayed by rains' });
    const { changed, changedFields } = diffTenderSnapshots(curr, prev);
    expect(changed).toBe(true);
    expect(changedFields).toEqual(['remarks']);
  });

  it('collects multiple changed fields', () => {
    const prev = buildTenderSnapshot(emptyRow());
    const curr = buildTenderSnapshot({
      ...emptyRow(),
      stage: 'evaluation',
      date_closed: '2026-04-10',
      remarks: 'Bids received',
    });
    const { changed, changedFields } = diffTenderSnapshots(curr, prev);
    expect(changed).toBe(true);
    expect(changedFields.sort()).toEqual(['date_closed', 'remarks', 'stage']);
  });
});

describe('diffTenderSnapshots — null / empty-string treatment', () => {
  it('treats null, undefined, and empty-string as equivalent for string fields', () => {
    const a: TenderSnapshot = { remarks: null };
    const b: TenderSnapshot = { remarks: '' };
    const c: TenderSnapshot = { remarks: undefined };
    expect(diffTenderSnapshots(a, b).changed).toBe(false);
    expect(diffTenderSnapshots(a, c).changed).toBe(false);
    expect(diffTenderSnapshots(b, c).changed).toBe(false);
  });

  it('treats null and undefined as equivalent for date fields', () => {
    const a: TenderSnapshot = { date_advertised: null };
    const b: TenderSnapshot = { date_advertised: undefined };
    expect(diffTenderSnapshots(a, b).changed).toBe(false);
  });
});

describe('normalizeDateLike — cross-representation equality', () => {
  it('normalizes Date objects to YYYY-MM-DD', () => {
    expect(normalizeDateLike(new Date('2026-03-01T12:34:56Z'))).toBe('2026-03-01');
  });

  it('normalizes ISO strings (with and without time) to YYYY-MM-DD', () => {
    expect(normalizeDateLike('2026-03-01')).toBe('2026-03-01');
    expect(normalizeDateLike('2026-03-01T12:00:00Z')).toBe('2026-03-01');
    expect(normalizeDateLike('2026-03-01T12:00:00.123+00:00')).toBe('2026-03-01');
  });

  it('normalizes Excel serial numbers to YYYY-MM-DD', () => {
    // Excel serial 46082 = 2026-03-01 (1899-12-30 epoch + 46082 days)
    expect(normalizeDateLike(46082)).toBe('2026-03-01');
  });

  it('returns null for null / undefined / empty / unparseable input', () => {
    expect(normalizeDateLike(null)).toBeNull();
    expect(normalizeDateLike(undefined)).toBeNull();
    expect(normalizeDateLike('')).toBeNull();
    expect(normalizeDateLike('   ')).toBeNull();
    expect(normalizeDateLike('not a date')).toBeNull();
    expect(normalizeDateLike(Number.NaN)).toBeNull();
  });

  it('treats all three representations of the same date as equal', () => {
    const asDate = new Date('2026-03-01T08:00:00Z');
    const asIso = '2026-03-01';
    const asSerial = 46082;
    const a: TenderSnapshot = { date_advertised: asDate };
    const b: TenderSnapshot = { date_advertised: asIso };
    const c: TenderSnapshot = { date_advertised: asSerial };
    expect(diffTenderSnapshots(a, b).changed).toBe(false);
    expect(diffTenderSnapshots(b, c).changed).toBe(false);
    expect(diffTenderSnapshots(a, c).changed).toBe(false);
  });
});

describe('diffTenderSnapshots — numeric tolerance', () => {
  it('treats implementation_status_pct values within 0.001 as equal', () => {
    const a: TenderSnapshot = { implementation_status_pct: 40 };
    const b: TenderSnapshot = { implementation_status_pct: 40.0005 };
    expect(diffTenderSnapshots(a, b).changed).toBe(false);
  });

  it('treats implementation_status_pct values differing by >= 0.001 as changed', () => {
    const a: TenderSnapshot = { implementation_status_pct: 40 };
    const b: TenderSnapshot = { implementation_status_pct: 40.002 };
    expect(diffTenderSnapshots(a, b).changed).toBe(true);
  });

  it('a numeric field flips from null to a value — counts as changed', () => {
    const a: TenderSnapshot = { implementation_status_pct: null };
    const b: TenderSnapshot = { implementation_status_pct: 0 };
    expect(diffTenderSnapshots(a, b).changed).toBe(true);
  });

  it('both null numeric fields — unchanged', () => {
    const a: TenderSnapshot = { implementation_status_pct: null };
    const b: TenderSnapshot = { implementation_status_pct: null };
    expect(diffTenderSnapshots(a, b).changed).toBe(false);
  });
});

describe('SNAPSHOT_FIELDS — sanity', () => {
  it('covers the fields the spec requires for freshness', () => {
    for (const f of [
      'stage',
      'date_advertised',
      'date_closed',
      'date_eval_sent_mtb_rtb',
      'date_eval_sent_nptab',
      'date_of_award',
      'contractor',
      'implementation_status_pct',
      'remarks',
    ]) {
      expect(SNAPSHOT_FIELDS).toContain(f);
    }
  });
});
