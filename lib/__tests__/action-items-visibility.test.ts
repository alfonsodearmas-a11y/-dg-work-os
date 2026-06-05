import { describe, it, expect } from 'vitest';
import { canSeeTask } from '@/lib/action-items/visibility';
import type { TaskWithExtensions, UserStaffFields } from '@/lib/action-items/types';

const baseTask: TaskWithExtensions = {
  id: 't1',
  title: 'Issue notification of termination to InterEnergy',
  description: null,
  status: 'new',
  priority: 'medium',
  due_date: null,
  agency: 'GPL',
  role: null,
  owner_user_id: 'u-kesh',
  assigned_by_user_id: null,
  source_meeting_id: 'm1',
  blocked_reason: null,
  completed_at: null,
  created_at: '2026-05-03T00:00:00Z',
  updated_at: '2026-05-03T00:00:00Z',
  source: 'extraction',
  extraction_id: 'e1',
  extraction_item_idx: 0,
  source_timestamp: '00:01:00',
  source_quote: 'q',
  owner_name_raw: 'Kesh',
  delegated_to_id: null,
  verb_category: 'correspondence',
  due_trigger: null,
  confidence_overall: 0.9,
  confidence_reasons: null,
  task_embedding: null,
  completion_note: null,
  completed_by: null,
  verified_by: null,
  verified_at: null,
  dispute_note: null,
  disputed_at: null,
  supersedes_id: null,
  visibility_scope: 'agency_normal',
};

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: 'x@example.com', name: 'X',
  role: 'officer', agency: null,
  aliases: [], closure_mode: 'self_close', is_agency_head: false,
  is_active: true, ...over,
});

describe('canSeeTask', () => {
  it('DG sees everything (agency_normal)', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg' }), baseTask)).toBe(true);
  });

  it('DG sees dg_only tasks', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(true);
  });

  it('PS sees agency_normal tasks in any agency', () => {
    expect(canSeeTask(u({ id: 'ps', role: 'ps' }), baseTask)).toBe(true);
  });

  it('parl_sec is treated as PS for visibility', () => {
    expect(canSeeTask(u({ id: 'p', role: 'parl_sec' }), baseTask)).toBe(true);
  });

  it('PS (superadmin under the two-level model) DOES see dg_only tasks — D1', () => {
    expect(canSeeTask(u({ id: 'ps', role: 'ps' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(true);
  });

  it('Minister sees agency_normal tasks', () => {
    expect(canSeeTask(u({ id: 'm', role: 'minister' }), baseTask)).toBe(true);
  });

  it('Minister (superadmin under the two-level model) DOES see dg_only tasks — D1', () => {
    expect(canSeeTask(u({ id: 'm', role: 'minister' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(true);
  });

  it('agency officer sees tasks in their home agency', () => {
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'GPL' }), baseTask)).toBe(true);
  });

  it('agency officer does NOT see tasks in another agency', () => {
    expect(canSeeTask(u({ id: 'mark', role: 'officer', agency: 'GWI' }), baseTask)).toBe(false);
  });

  it('owner sees their own task even outside their home agency', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GWI' }),
      { ...baseTask, owner_user_id: 'kesh', agency: 'MPUA-DG' },
    )).toBe(true);
  });

  it('delegate sees a task delegated to them', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GWI' }),
      { ...baseTask, owner_user_id: 'someone-else', delegated_to_id: 'kesh', agency: 'MPUA-DG' },
    )).toBe(true);
  });

  it('agency officer does NOT see dg_only tasks even in their own agency', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GPL' }),
      { ...baseTask, visibility_scope: 'dg_only' },
    )).toBe(false);
  });

  it('agency_admin behaves like officer for visibility', () => {
    expect(canSeeTask(u({ id: 'a', role: 'agency_admin', agency: 'GPL' }), baseTask)).toBe(true);
  });

  it('inactive user sees nothing', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg', is_active: false }), baseTask)).toBe(false);
  });

  it('agency comparison is case-insensitive (tasks.agency is freeform)', () => {
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'gpl' }), baseTask)).toBe(true);
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'gpl' }),
      { ...baseTask, agency: 'gpl' })).toBe(true);
  });

  it('null task.agency does not match', () => {
    expect(canSeeTask(
      u({ id: 'k', role: 'officer', agency: 'GPL' }),
      { ...baseTask, agency: null },
    )).toBe(false);
  });
});
