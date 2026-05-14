import { describe, it, expect } from 'vitest';
import { assignPriority } from '@/lib/action-items/resolution/priority';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'officer', agency: null, aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const baseDraft = {
  task: 'Issue notification of termination',
  source_quote: '',
  due_at: null as Date | null,
  speaker_role: 'officer' as 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg',
};

const meetingDate = new Date('2026-04-13T10:00:00-04:00');

describe('assignPriority', () => {
  it('P0 when deadline ≤24h AND safety keyword in task', () => {
    const due = new Date(meetingDate.getTime() + 12 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, task: 'Investigate fire at Kingston substation', due_at: due }, u({}), meetingDate);
    expect(r).toBe('critical');
  });
  it('P0 when deadline ≤24h AND speaker is minister', () => {
    const due = new Date(meetingDate.getTime() + 12 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, due_at: due, speaker_role: 'minister' }, u({}), meetingDate);
    expect(r).toBe('critical');
  });
  it('P1 when deadline ≤5 weekdays AND speaker is ps', () => {
    const due = new Date(meetingDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, due_at: due, speaker_role: 'ps' }, u({}), meetingDate);
    expect(r).toBe('high');
  });
  it('P2 for deadline 6–28 days', () => {
    const due = new Date(meetingDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(assignPriority({ ...baseDraft, due_at: due }, u({}), meetingDate)).toBe('medium');
  });
  it('P3 for no deadline', () => {
    expect(assignPriority({ ...baseDraft, due_at: null }, u({}), meetingDate)).toBe('low');
  });
  it('P3 for deadline >28 days', () => {
    const due = new Date(meetingDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    expect(assignPriority({ ...baseDraft, due_at: due }, u({}), meetingDate)).toBe('low');
  });
});
