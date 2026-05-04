import { describe, it, expect } from 'vitest';
import { canSeeItem } from '@/lib/action-items/visibility';
import type { ActionItemRow, UserStaffFields } from '@/lib/action-items/types';

const baseItem: ActionItemRow = {
  id: 'i1', source: 'extraction',
  extraction_id: 'e1', extraction_item_idx: 0,
  source_meeting_id: 'm1', source_timestamp: '00:01:00', source_quote: 'q',
  created_by: null,
  agency_name: 'GPL', owner_id: 'u-kesh', owner_name_raw: 'Kesh',
  delegated_to_id: null,
  verb_category: 'correspondence', task: 'issue notice', due_at: null, due_trigger: null,
  priority: 'P2',
  status: 'open',
  reviewed_by: null, reviewed_at: null,
  completed_by: null, completed_at: null, completion_note: null,
  verified_by: null, verified_at: null,
  disputed_at: null, dispute_note: null,
  supersedes_id: null,
  confidence_overall: 0.9, confidence_reasons: null, task_embedding: null,
  visibility_scope: 'agency_normal',
  created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z',
};

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: 'x@example.com', name: 'X',
  role: 'officer', agency: null,
  aliases: [], closure_mode: 'self_close', is_agency_head: false,
  is_active: true, ...over,
});

describe('canSeeItem', () => {
  it('DG sees everything (agency_normal)', () => {
    expect(canSeeItem(u({ id: 'dg', role: 'dg' }), baseItem)).toBe(true);
  });

  it('DG sees dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'dg', role: 'dg' }), item)).toBe(true);
  });

  it('PS sees agency_normal items in any agency', () => {
    expect(canSeeItem(u({ id: 'ps', role: 'ps' }), baseItem)).toBe(true);
  });

  it('parl_sec is treated as PS for visibility', () => {
    expect(canSeeItem(u({ id: 'p', role: 'parl_sec' }), baseItem)).toBe(true);
  });

  it('PS does NOT see dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'ps', role: 'ps' }), item)).toBe(false);
  });

  it('Minister (read-only ministry role) sees agency_normal items', () => {
    expect(canSeeItem(u({ id: 'min', role: 'minister' }), baseItem)).toBe(true);
  });

  it('Minister does NOT see dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'min', role: 'minister' }), item)).toBe(false);
  });

  it('agency officer sees items where agency_name matches their home agency', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'GPL' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });

  it('agency officer does NOT see items in another agency', () => {
    const user = u({ id: 'mark', role: 'officer', agency: 'GWI' });
    expect(canSeeItem(user, baseItem)).toBe(false);
  });

  it('agency officer sees items they own even outside their home agency', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'GWI' });
    const item = { ...baseItem, agency_name: 'MPUA-DG' as const, owner_id: 'kesh' };
    expect(canSeeItem(user, item)).toBe(true);
  });

  it('agency officer does NOT see dg_only items in their own agency', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'GPL' });
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(user, item)).toBe(false);
  });

  it('agency_admin behaves like officer for visibility', () => {
    const user = u({ id: 'a', role: 'agency_admin', agency: 'GPL' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });

  it('inactive user sees nothing', () => {
    const user = u({ id: 'dg', role: 'dg', is_active: false });
    expect(canSeeItem(user, baseItem)).toBe(false);
  });

  it('agency comparison is case-insensitive (matches existing canAccessAgency convention)', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'gpl' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });
});
