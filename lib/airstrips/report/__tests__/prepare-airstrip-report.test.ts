import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockDownload } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockDownload: vi.fn() }));
vi.mock('@/lib/db-admin', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => mockFrom(...a),
    storage: { from: () => ({ download: (...a: unknown[]) => mockDownload(...a) }) },
  },
}));

import {
  prepareAirstripReport, resolveReportRange, buildTrend, photoFormat,
} from '@/lib/airstrips/report/prepare-airstrip-report';
import { supabaseChain as chain } from '@/tests/supabase-mock';
import { addDays, guyanaToday } from '@/lib/airstrip-types';

describe('resolveReportRange', () => {
  it('defaults to the last 12 months (Guyana)', () => {
    const r = resolveReportRange();
    expect(r.to).toBe(guyanaToday());
    expect(r.from).toBe(addDays(r.to, -365));
  });
  it('respects an explicit, well-formed range', () => {
    expect(resolveReportRange('2025-01-01', '2025-12-31')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('ignores malformed inputs and falls back', () => {
    const r = resolveReportRange('garbage', 'also-bad');
    expect(r.to).toBe(guyanaToday());
  });
});

describe('buildTrend', () => {
  it('groups by quarter and sorts chronologically across a year boundary', () => {
    const t = buildTrend([
      { performed_date: '2026-01-10', verified: true },
      { performed_date: '2025-11-02', verified: false },
      { performed_date: '2026-01-20', verified: false },
    ]);
    expect(t.map(p => p.quarter)).toEqual(['Q4 2025', 'Q1 2026']);   // chronological, not lexical
    expect(t[1]).toEqual({ quarter: 'Q1 2026', activities: 2, verified: 1 });
  });
});

describe('photoFormat', () => {
  it('maps jpg/png and rejects webp/unknown', () => {
    expect(photoFormat('x.jpg')).toBe('jpg');
    expect(photoFormat('x.jpeg')).toBe('jpg');
    expect(photoFormat('x.PNG')).toBe('png');
    expect(photoFormat(null, 'image/png')).toBe('png');
    expect(photoFormat('x.webp')).toBeNull();
    expect(photoFormat('x.gif')).toBeNull();
  });
});

const overviewRow = {
  id: 'a1', name: 'Kato', region: 8, status: 'operational',
  surface_type: 'Laterite', surface_condition: 'Good', runway_length_m: 900, runway_width_m: 18,
  coordinates_lat: 4.6, coordinates_lon: -59.8, last_inspection_date: '2026-06-01',
  target_maintenance_interval_days: null, responsible_manager_id: 'm1',
  last_maintenance_on: '2026-05-01', last_verified_on: '2026-05-05',
  responsible_contractor_id: 'c1', responsible_contractor_name: 'J. Williams', responsible_manager_name: 'Akeem',
};
const settings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90 };

function wireTables(over: unknown, logs: unknown[], insp: unknown[], photoRows: unknown[]) {
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'airstrip_overview': return chain({ data: over, error: null });
      case 'airstrip_settings': return chain({ data: settings, error: null });
      case 'airstrip_maintenance_log': return chain({ data: logs, error: null });
      case 'airstrip_inspections': return chain({ data: insp, error: null });
      case 'airstrip_photos': return chain({ data: photoRows, error: null });
      default: return chain({ data: null, error: null });
    }
  });
}

describe('prepareAirstripReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns structured data and embeds photo BYTES via storage.download (no URL layer)', async () => {
    wireTables(
      overviewRow,
      [{ id: 'log1', performed_date: '2026-05-01', activity_type: 'weeding_cleaning', verification_method: 'photo_verification', verified: true, verified_at: '2026-05-05', quarter: 'Q2 2026', activity_description: 'cleared', contractor_name: 'J. Williams', notes: null }],
      [{ inspection_date: '2026-06-01', inspector_name: 'Insp', surface_condition: 'Good', findings: 'ok' }],
      [{ storage_path: 'a1/verification/1_x.jpg', file_name: 'x.jpg', caption: 'after' }],
    );
    mockDownload.mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer, type: 'image/jpeg' }, error: null });

    const data = await prepareAirstripReport('a1', '2026-01-01', '2026-06-25');
    expect(data).not.toBeNull();
    expect(data!.airstrip.name).toBe('Kato');
    expect(data!.range).toEqual({ from: '2026-01-01', to: '2026-06-25' });
    expect(data!.maintenance).toHaveLength(1);
    expect(data!.maintenance[0].photos).toHaveLength(1);
    expect(Buffer.isBuffer(data!.maintenance[0].photos[0].data)).toBe(true);     // raw bytes embedded
    expect(data!.maintenance[0].photos[0].format).toBe('jpg');
    expect(data!.inspections).toHaveLength(1);
    expect(data!.trend.length).toBeGreaterThan(0);
    expect(data!.hasPaymentModel).toBe(false);                                    // payment section omitted
    expect(mockDownload).toHaveBeenCalledWith('a1/verification/1_x.jpg');
  });

  it('handles a never-maintained strip without throwing (empty timeline + trend)', async () => {
    wireTables(overviewRow, [], [], []);
    const data = await prepareAirstripReport('a1');
    expect(data).not.toBeNull();
    expect(data!.maintenance).toEqual([]);
    expect(data!.trend).toEqual([]);
    expect(data!.range.to).toBe(guyanaToday());
  });

  it('returns null when the airstrip does not exist', async () => {
    wireTables(null, [], [], []);
    mockFrom.mockImplementation((table: string) =>
      table === 'airstrip_overview' ? chain({ data: null, error: { message: 'not found' } }) : chain({ data: settings, error: null }));
    const data = await prepareAirstripReport('missing');
    expect(data).toBeNull();
  });
});
