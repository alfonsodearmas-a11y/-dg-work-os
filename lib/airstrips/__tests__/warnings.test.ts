import { describe, it, expect } from 'vitest';
import { computeAirstripWarnings, resolveIntervalDays } from '@/lib/airstrips/warnings';
import { addDays, daysBetween, guyanaToday } from '@/lib/airstrip-types';

const baseInput = {
  name: 'Kato',
  lastVerifiedOn: '2026-06-20',
  intervalDays: 60,
  upcomingWindowDays: 14,
  verificationStaleAfterDays: 90,
  contractorName: 'J. Williams',
  managerName: 'Akeem',
  today: '2026-06-25',
};

describe('resolveIntervalDays', () => {
  it('uses the per-strip override when set', () => {
    expect(resolveIntervalDays(30, 60)).toBe(30);
  });
  it('falls back to the global default when null/zero', () => {
    expect(resolveIntervalDays(null, 60)).toBe(60);
    expect(resolveIntervalDays(0, 60)).toBe(60);
  });
});

describe('computeAirstripWarnings', () => {
  it('flags overdue with the correct day count and names', () => {
    // last maintenance 2026-04-01 + 60d = next due 2026-05-31; today 2026-06-25 → 25 days overdue
    const r = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-04-01' });
    const overdue = r.warnings.find(w => w.type === 'overdue');
    expect(overdue?.daysOverdue).toBe(25);
    expect(r.attentionLevel).toBe('overdue');
    expect(r.nextDueOn).toBe('2026-05-31');
    expect(overdue?.contractorName).toBe('J. Williams');
    expect(overdue?.managerName).toBe('Akeem');
    expect(overdue?.responsibilityIncomplete).toBe(false);
  });

  it('flags upcoming within the window', () => {
    // last 2026-05-01 + 60 = 2026-06-30; today 2026-06-25 → due in 5 days
    const r = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-05-01' });
    const up = r.warnings.find(w => w.type === 'upcoming');
    expect(up?.daysUntilDue).toBe(5);
    expect(r.attentionLevel).toBe('upcoming');
  });

  it('is silent when comfortably within cadence and recently verified', () => {
    // last 2026-06-20 + 60 = 2026-08-19; verified 2026-06-20 → ok
    const r = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-06-20' });
    expect(r.warnings).toHaveLength(0);
    expect(r.attentionLevel).toBe('ok');
  });

  it('treats no maintenance on record as a red "never recorded" warning (not green, not empty)', () => {
    const r = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: null });
    expect(r.warnings.length).toBeGreaterThan(0);          // not empty
    expect(r.attentionLevel).not.toBe('ok');               // not green
    const overdue = r.warnings.find(w => w.type === 'overdue');
    expect(overdue).toBeDefined();
    expect(overdue!.severity).toBe('critical');            // red
    expect(overdue!.message).toMatch(/no maintenance on record/i);
    expect(r.nextDueOn).toBeNull();
    expect(r.daysOverdue).toBeNull();
  });

  it('inherits the global default when interval override is null, uses the override otherwise', () => {
    // override null → inherit 60: last 2026-04-01 + 60 = 2026-05-31 → overdue on 2026-06-25
    const inherit = computeAirstripWarnings({
      ...baseInput, lastMaintenanceOn: '2026-04-01',
      intervalDays: resolveIntervalDays(null, 60),
    });
    expect(inherit.nextDueOn).toBe('2026-05-31');
    // override 120 → last 2026-04-01 + 120 = 2026-07-30 → not overdue yet
    const override = computeAirstripWarnings({
      ...baseInput, lastMaintenanceOn: '2026-04-01',
      intervalDays: resolveIntervalDays(120, 60),
    });
    expect(override.nextDueOn).toBe('2026-07-30');
    expect(override.warnings.some(w => w.type === 'overdue')).toBe(false);
  });
});

describe('TZ-safe date helpers (asserted independent of host timezone)', () => {
  it('guyanaToday converts a UTC instant to the Guyana (UTC-4) calendar date', () => {
    // 2026-10-01T01:00Z is still 2026-09-30 21:00 in Guyana
    expect(guyanaToday(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09-30');
    expect(guyanaToday(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
  });
  it('addDays / daysBetween are exact on YYYY-MM-DD strings across month + quarter boundaries', () => {
    expect(addDays('2026-04-01', 60)).toBe('2026-05-31');
    expect(addDays('2026-12-20', 14)).toBe('2027-01-03');
    expect(daysBetween('2026-06-25', '2026-05-31')).toBe(-25);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('flags verification stale by age and by absence', () => {
    const byAge = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-06-20', lastVerifiedOn: '2026-01-01' });
    expect(byAge.warnings.some(w => w.type === 'verification_stale')).toBe(true);
    const byMissing = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-06-20', lastVerifiedOn: null });
    expect(byMissing.warnings.some(w => w.type === 'verification_stale')).toBe(true);
  });

  it('marks responsibility incomplete when contractor or manager is missing', () => {
    const r = computeAirstripWarnings({ ...baseInput, lastMaintenanceOn: '2026-04-01', contractorName: null });
    expect(r.warnings[0].responsibilityIncomplete).toBe(true);
  });
});
