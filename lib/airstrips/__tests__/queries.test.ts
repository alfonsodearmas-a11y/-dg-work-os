import { describe, it, expect } from 'vitest';
import { augmentAirstrip, type AirstripOverviewRow, type AirstripSettings } from '@/lib/airstrips/queries';

const row: AirstripOverviewRow = {
  id: 'strip-1',
  name: 'Kato',
  region: 8,
  status: 'operational',
  target_maintenance_interval_days: null,
  responsible_manager_id: 'mgr-1',
  last_maintenance_on: '2026-04-01',
  last_verified_on: '2026-06-20',
  responsible_contractor_id: 'c-1',
  responsible_contractor_name: 'J. Williams',
  responsible_manager_name: 'Akeem',
};

const today = '2026-06-25';

describe('augmentAirstrip', () => {
  it('recomputes warnings against the current settings — a longer interval clears an overdue strip', () => {
    // 60-day interval: 2026-04-01 + 60 = 2026-05-31 → overdue on 2026-06-25
    const tight: AirstripSettings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90 };
    const a = augmentAirstrip(row, tight, today);
    expect(a.cadence.attentionLevel).toBe('overdue');

    // Same strip, 120-day default → next due 2026-07-30 → no longer overdue
    const loose: AirstripSettings = { default_interval_days: 120, upcoming_window_days: 14, verification_stale_after_days: 90 };
    const b = augmentAirstrip(row, loose, today);
    expect(b.cadence.attentionLevel).not.toBe('overdue');
    expect(b.cadence.nextDueOn).toBe('2026-07-30');
  });

  it('per-strip override beats the global default', () => {
    const settings: AirstripSettings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90 };
    const a = augmentAirstrip({ ...row, target_maintenance_interval_days: 120 }, settings, today);
    expect(a.intervalDays).toBe(120);
    expect(a.cadence.nextDueOn).toBe('2026-07-30');
  });

  it('exposes responsibility and threads the names into the warnings', () => {
    const settings: AirstripSettings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90 };
    const a = augmentAirstrip(row, settings, today);
    expect(a.responsibility).toEqual({
      contractorId: 'c-1', contractorName: 'J. Williams', managerId: 'mgr-1', managerName: 'Akeem',
    });
    const w = a.cadence.warnings[0];
    expect(w.contractorName).toBe('J. Williams');
    expect(w.managerName).toBe('Akeem');
    expect(w.responsibilityIncomplete).toBe(false);
  });

  it('flags responsibility incomplete when contractor or manager is missing', () => {
    const settings: AirstripSettings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90 };
    const a = augmentAirstrip(
      { ...row, responsible_contractor_id: null, responsible_contractor_name: null },
      settings, today,
    );
    expect(a.cadence.warnings.every(w => w.responsibilityIncomplete)).toBe(true);
  });
});
