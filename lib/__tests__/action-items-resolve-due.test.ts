import { describe, it, expect } from 'vitest';
import { resolveDueDate } from '@/lib/action-items/resolution/due';

const monday = new Date('2026-04-13T10:00:00-04:00');     // Mon, 10 AM Guyana
const friday = new Date('2026-04-17T15:00:00-04:00');     // Fri, 3 PM Guyana

describe('resolveDueDate', () => {
  it('today → meeting-date 18:00 Guyana', () => {
    const r = resolveDueDate('today', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-13');
    expect(r.due_trigger).toBeNull();
  });
  it('tomorrow → next-day 09:00', () => {
    expect(resolveDueDate('tomorrow', monday).due_at?.toISOString().slice(0, 10)).toBe('2026-04-14');
  });
  it('this week → Friday of meeting week', () => {
    const r = resolveDueDate('this week', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-17');
  });
  it('this week on Friday-afternoon → following Friday', () => {
    const r = resolveDueDate('this week', friday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-24');
  });
  it('next week → Friday of following week', () => {
    expect(resolveDueDate('next week', monday).due_at?.toISOString().slice(0, 10)).toBe('2026-04-24');
  });
  it('ASAP → meeting + 3 weekdays, flagged', () => {
    const r = resolveDueDate('ASAP', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-16');   // Thu
    expect(r.flagged).toBe(true);
  });
  it('"when ready" → null due, due_trigger set', () => {
    const r = resolveDueDate('when ready', monday);
    expect(r.due_at).toBeNull();
    expect(r.due_trigger).toBe('when ready');
  });
  it('null phrase → null with low confidence flag', () => {
    const r = resolveDueDate(null, monday);
    expect(r.due_at).toBeNull();
    expect(r.due_trigger).toBeNull();
    expect(r.flagged).toBe(true);
  });
});
