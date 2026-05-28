import { describe, expect, test } from 'vitest';
import { computeNextRunAt } from './schedule-utils';

const TZ = 'America/Guyana';

describe('computeNextRunAt — weekly', () => {
  test('upcoming day later this week', () => {
    // Monday 2026-06-01 14:00 UTC = 10:00 Guyana local. Configured Wednesday
    // (day_of_week=3) at 08:00 local, which is 12:00 UTC.
    const from = new Date('2026-06-01T14:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'weekly', day_of_week: 3, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2026-06-03T12:00:00.000Z');
  });

  test('wraps to next week when today is past send hour', () => {
    // Wednesday 2026-06-03 13:00 UTC = 09:00 Guyana local. Configured
    // Wednesday at 08:00 local. Already past.
    const from = new Date('2026-06-03T13:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'weekly', day_of_week: 3, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2026-06-10T12:00:00.000Z');
  });

  test('same day, before send hour, fires today', () => {
    // Wednesday 2026-06-03 11:00 UTC = 07:00 Guyana local. Send hour 08:00
    // local = 12:00 UTC. Should fire later today.
    const from = new Date('2026-06-03T11:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'weekly', day_of_week: 3, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2026-06-03T12:00:00.000Z');
  });
});

describe('computeNextRunAt — fortnightly', () => {
  test('first run computed as weekly, second adds 7 more days', () => {
    const from = new Date('2026-06-01T14:00:00Z');
    const first = computeNextRunAt(
      { frequency: 'fortnightly', day_of_week: 3, send_hour: 8, timezone: TZ },
      from,
    );
    expect(first.toISOString()).toBe('2026-06-03T12:00:00.000Z');
    const second = computeNextRunAt(
      { frequency: 'fortnightly', day_of_week: 3, send_hour: 8, timezone: TZ },
      first,
    );
    expect(second.toISOString()).toBe('2026-06-17T12:00:00.000Z');
  });
});

describe('computeNextRunAt — monthly', () => {
  test('upcoming day in same month', () => {
    const from = new Date('2026-06-05T10:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'monthly', day_of_month: 15, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });

  test('rolls into next month when this month is past', () => {
    const from = new Date('2026-06-16T10:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'monthly', day_of_month: 15, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  test('December rolls into January of next year', () => {
    const from = new Date('2026-12-20T10:00:00Z');
    const next = computeNextRunAt(
      { frequency: 'monthly', day_of_month: 5, send_hour: 8, timezone: TZ },
      from,
    );
    expect(next.toISOString()).toBe('2027-01-05T12:00:00.000Z');
  });
});

describe('computeNextRunAt — validation', () => {
  test('weekly without day_of_week throws', () => {
    const from = new Date('2026-06-01T14:00:00Z');
    expect(() =>
      computeNextRunAt(
        { frequency: 'weekly', day_of_week: null, send_hour: 8, timezone: TZ },
        from,
      ),
    ).toThrow(/day_of_week/);
  });

  test('monthly without day_of_month throws', () => {
    const from = new Date('2026-06-01T14:00:00Z');
    expect(() =>
      computeNextRunAt(
        { frequency: 'monthly', day_of_month: null, send_hour: 8, timezone: TZ },
        from,
      ),
    ).toThrow(/day_of_month/);
  });
});
