import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { renderAirstripReportPDF } from '@/lib/pdf/airstrip-report-render';
import type { AirstripReportData } from '@/lib/airstrips/report/prepare-airstrip-report';

// A real PNG distinct from the letterhead logo (so @react-pdf can't dedupe it away),
// exercising the bytes-only (no-URL) photo embed path with guaranteed-valid bytes.
const REAL_PNG = readFileSync(path.join(process.cwd(), 'public', 'icons', 'icon-192.png'));

function baseData(overrides: Partial<AirstripReportData> = {}): AirstripReportData {
  return {
    airstrip: {
      id: 'a1', name: 'Kato', region: 8, status: 'operational',
      surface_type: 'Laterite', surface_condition: 'Good', runway_length_m: 900, runway_width_m: 18,
      coordinates_lat: 4.6, coordinates_lon: -59.8, last_inspection_date: '2026-06-01',
    },
    responsibility: { contractorName: 'J. Williams', managerName: 'Akeem' },
    cadence: { nextDueOn: null, daysOverdue: null, attentionLevel: 'overdue', warnings: [
      { type: 'overdue', severity: 'critical', nextDueOn: null, message: 'Kato has no maintenance on record', contractorName: 'J. Williams', managerName: 'Akeem', responsibilityIncomplete: false },
    ] },
    intervalDays: 60,
    range: { from: '2025-06-25', to: '2026-06-25' },
    maintenance: [],
    inspections: [],
    trend: [],
    hasPaymentModel: false,
    generatedAt: '2026-06-25',
    ...overrides,
  };
}

const isPdf = (b: Buffer) => b.length > 800 && b.subarray(0, 5).toString() === '%PDF-';

describe('renderAirstripReportPDF', () => {
  it('produces a valid, non-empty PDF for a never-maintained strip (says so, does not throw)', async () => {
    const buf = await renderAirstripReportPDF(baseData());
    expect(isPdf(buf)).toBe(true);
  }, 30000);

  it('embeds photo bytes (no URL) — the PDF is materially larger than the photo-free one', async () => {
    const withoutPhoto = await renderAirstripReportPDF(baseData({
      maintenance: [{
        performed_date: '2026-05-01', activity_type: 'weeding_cleaning', activity_description: 'cleared',
        contractor_name: 'J. Williams', verification_method: 'photo_verification', verified: true,
        verified_at: '2026-05-05', quarter: 'Q2 2026', notes: null, photos: [],
      }],
      trend: [{ quarter: 'Q2 2026', activities: 1, verified: 1 }],
    }));
    const withPhoto = await renderAirstripReportPDF(baseData({
      maintenance: [{
        performed_date: '2026-05-01', activity_type: 'weeding_cleaning', activity_description: 'cleared',
        contractor_name: 'J. Williams', verification_method: 'photo_verification', verified: true,
        verified_at: '2026-05-05', quarter: 'Q2 2026', notes: null,
        photos: [{ data: REAL_PNG, format: 'png', caption: 'after' }],
      }],
      trend: [{ quarter: 'Q2 2026', activities: 1, verified: 1 }],
    }));
    expect(isPdf(withPhoto)).toBe(true);
    // If the image were skipped (corrupt/not embedded), the two PDFs would be ~equal.
    expect(withPhoto.length).toBeGreaterThan(withoutPhoto.length + 5000);
  }, 30000);
});
