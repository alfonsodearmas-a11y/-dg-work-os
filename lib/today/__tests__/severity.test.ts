import { describe, it, expect } from 'vitest';
import {
  severityForDelayedProject,
  severityForTenderSla,
  severityForMeetingAction,
  daysOverSla,
  daysBetweenDates,
  daysSinceISO,
  severityRank,
} from '@/lib/today/severity';
import { TENDER_STAGE_SLA_DAYS } from '@/lib/today/types';

describe('severityForDelayedProject', () => {
  it('returns critical at or above 90 days overdue', () => {
    expect(severityForDelayedProject(90)).toBe('critical');
    expect(severityForDelayedProject(365)).toBe('critical');
  });

  it('returns high between 30 and 89 days overdue', () => {
    expect(severityForDelayedProject(30)).toBe('high');
    expect(severityForDelayedProject(89)).toBe('high');
  });

  it('returns medium below 30 days overdue', () => {
    expect(severityForDelayedProject(0)).toBe('medium');
    expect(severityForDelayedProject(29)).toBe('medium');
  });

  it('treats null days_overdue as medium (stalled-only, not past end_date)', () => {
    expect(severityForDelayedProject(null)).toBe('medium');
  });

  it('boundary: 29 vs 30 split medium/high, 89 vs 90 split high/critical', () => {
    expect(severityForDelayedProject(29)).toBe('medium');
    expect(severityForDelayedProject(30)).toBe('high');
    expect(severityForDelayedProject(89)).toBe('high');
    expect(severityForDelayedProject(90)).toBe('critical');
  });
});

describe('daysOverSla', () => {
  it('returns null for award stage (no SLA)', () => {
    expect(daysOverSla('award', 500)).toBeNull();
  });

  it('subtracts the stage SLA from days_at_current_stage', () => {
    expect(daysOverSla('design', 50)).toBe(50 - 45);
    expect(daysOverSla('advertised', 30)).toBe(0);
    expect(daysOverSla('evaluation', 29)).toBe(-1);
    expect(daysOverSla('awaiting_award', 22)).toBe(1);
  });

  it('matches the canonical SLA table exactly', () => {
    expect(TENDER_STAGE_SLA_DAYS.design).toBe(45);
    expect(TENDER_STAGE_SLA_DAYS.advertised).toBe(30);
    expect(TENDER_STAGE_SLA_DAYS.evaluation).toBe(30);
    expect(TENDER_STAGE_SLA_DAYS.awaiting_award).toBe(21);
    expect(TENDER_STAGE_SLA_DAYS.award).toBeNull();
  });
});

describe('severityForTenderSla', () => {
  it('returns critical at 30+ days over SLA', () => {
    expect(severityForTenderSla(30)).toBe('critical');
    expect(severityForTenderSla(100)).toBe('critical');
  });

  it('returns high between 14 and 29 days over SLA', () => {
    expect(severityForTenderSla(14)).toBe('high');
    expect(severityForTenderSla(29)).toBe('high');
  });

  it('returns medium between 1 and 13 days over SLA', () => {
    expect(severityForTenderSla(1)).toBe('medium');
    expect(severityForTenderSla(13)).toBe('medium');
  });

  it('boundary: 13/14 split medium/high, 29/30 split high/critical', () => {
    expect(severityForTenderSla(13)).toBe('medium');
    expect(severityForTenderSla(14)).toBe('high');
    expect(severityForTenderSla(29)).toBe('high');
    expect(severityForTenderSla(30)).toBe('critical');
  });
});

describe('severityForMeetingAction', () => {
  it('returns critical when 14+ days past due', () => {
    expect(severityForMeetingAction({ daysPastDue: 14, daysSinceCreated: 20 })).toBe('critical');
    expect(severityForMeetingAction({ daysPastDue: 60, daysSinceCreated: 70 })).toBe('critical');
  });

  it('returns high when 1-13 days past due', () => {
    expect(severityForMeetingAction({ daysPastDue: 1, daysSinceCreated: 5 })).toBe('high');
    expect(severityForMeetingAction({ daysPastDue: 13, daysSinceCreated: 20 })).toBe('high');
  });

  it('returns medium when due within next 7 days (not yet past)', () => {
    expect(severityForMeetingAction({ daysPastDue: 0, daysSinceCreated: 2 })).toBe('medium');
    expect(severityForMeetingAction({ daysPastDue: -7, daysSinceCreated: 2 })).toBe('medium');
  });

  it('returns null when due more than 7 days out (not a Today signal)', () => {
    expect(severityForMeetingAction({ daysPastDue: -30, daysSinceCreated: 1 })).toBeNull();
  });

  it('no due_date: medium if created ≥ 30d ago, null otherwise', () => {
    expect(severityForMeetingAction({ daysPastDue: null, daysSinceCreated: 30 })).toBe('medium');
    expect(severityForMeetingAction({ daysPastDue: null, daysSinceCreated: 29 })).toBeNull();
    expect(severityForMeetingAction({ daysPastDue: null, daysSinceCreated: 0 })).toBeNull();
  });
});

describe('daysBetweenDates', () => {
  it('returns 0 for the same calendar date', () => {
    expect(daysBetweenDates('2026-04-21T08:00:00Z', '2026-04-21T23:59:00Z')).toBe(0);
  });

  it('returns a positive integer for later-date input', () => {
    expect(daysBetweenDates('2026-04-01T00:00:00Z', '2026-04-21T00:00:00Z')).toBe(20);
  });

  it('returns a negative integer when laterISO is earlier', () => {
    expect(daysBetweenDates('2026-04-21T00:00:00Z', '2026-04-01T00:00:00Z')).toBe(-20);
  });

  it('does not flip signs around midnight / DST edges', () => {
    // Crossing a US-DST edge (2026-03-08): 2026-03-07 → 2026-03-09 is 2 days.
    expect(daysBetweenDates('2026-03-07T12:00:00Z', '2026-03-09T12:00:00Z')).toBe(2);
  });
});

describe('daysSinceISO', () => {
  it('returns null for null input', () => {
    expect(daysSinceISO(null)).toBeNull();
  });

  it('computes days since the given ISO relative to injected now', () => {
    const now = new Date('2026-04-21T00:00:00Z');
    expect(daysSinceISO('2026-04-01T00:00:00Z', now)).toBe(20);
  });
});

describe('severityRank', () => {
  it('orders critical < high < medium by rank number (for sort ascending)', () => {
    expect(severityRank('critical')).toBeLessThan(severityRank('high'));
    expect(severityRank('high')).toBeLessThan(severityRank('medium'));
  });
});
