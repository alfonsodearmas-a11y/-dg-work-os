import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { computeActivation } from '@/lib/action-items/trust/tracker';

const baseCounters = {
  meetings_reviewed: 10,
  accepted_unedited_pct: 0.96,
  attribution_errors_in_window: 0,
  earliest_review: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('computeActivation', () => {
  it('returns activated=true when all criteria met and flag on', () => {
    expect(computeActivation(baseCounters, true).activated).toBe(true);
  });
  it('returns false when env flag is off', () => {
    expect(computeActivation(baseCounters, false).activated).toBe(false);
  });
  it('returns false when fewer than 8 meetings reviewed', () => {
    const r = computeActivation({ ...baseCounters, meetings_reviewed: 7 }, true);
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/8 meetings/);
  });
  it('returns false when accepted-unedited < 95%', () => {
    const r = computeActivation({ ...baseCounters, accepted_unedited_pct: 0.94 }, true);
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/95%/);
  });
  it('returns false when attribution errors > 0', () => {
    const r = computeActivation({ ...baseCounters, attribution_errors_in_window: 1 }, true);
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/attribution/);
  });
  it('returns false when earliest review is null', () => {
    const r = computeActivation({ ...baseCounters, earliest_review: null }, true);
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/no reviews/);
  });
  it('returns false when window is younger than 30 days', () => {
    const r = computeActivation(
      { ...baseCounters, earliest_review: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      true,
    );
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/30/);
  });
});
