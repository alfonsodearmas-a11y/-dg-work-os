import { describe, it, expect } from 'vitest';
import { requiresMandatoryReview } from '@/lib/action-items/gate';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'agency_manager', agency: 'gpl', aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const baseMeeting = {
  detected_type: 'internal' as 'internal' | 'agency' | 'external' | null,
  detected_modality: 'virtual' as 'virtual' | 'in_person' | 'mixed' | null,
  inaudible_pct: 0.05,
};
const baseItem = {
  confidence_overall: 0.9,
  validation_failed: false,
  owner_id: 'u',
  due_at: new Date('2026-05-10'),
  due_trigger: null as string | null,
};
const owner = u({});

describe('requiresMandatoryReview', () => {
  it('passes (quick-scan) when nothing is unusual', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting, owner)).toBe(false);
  });
  it('mandatory when detected_type is null (unclassified)', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: null }, owner)).toBe(true);
  });
  it('mandatory when detected_modality is null (unclassified)', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: null }, owner)).toBe(true);
  });
  it('mandatory when type is agency or external', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: 'agency' }, owner)).toBe(true);
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: 'external' }, owner)).toBe(true);
  });
  it('mandatory when modality is in_person or mixed', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: 'in_person' }, owner)).toBe(true);
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: 'mixed' }, owner)).toBe(true);
  });
  it('mandatory when owner is agency head (one of 7 CEOs)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting, u({ is_agency_head: true }))).toBe(true);
  });
  it('mandatory when owner is DG', () => {
    expect(requiresMandatoryReview({ ...baseItem, owner_id: 'dg' }, baseMeeting, u({ id: 'dg', role: 'superadmin' }))).toBe(true);
  });
  // Three populations gated by closure_mode='dg_managed' — Minister, PS, parl_sec.
  // is_agency_head=false for these (per spec §0 #12). Same gate trigger, distinct semantic.
  it('mandatory when owner is Minister (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'min', role: 'superadmin', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when owner is PS (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'ps', role: 'ps', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when owner is parl_sec (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'pse', role: 'parl_sec', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when confidence_overall < 0.85', () => {
    expect(requiresMandatoryReview({ ...baseItem, confidence_overall: 0.8 }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when validation flagged', () => {
    expect(requiresMandatoryReview({ ...baseItem, validation_failed: true }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when owner_id is null', () => {
    expect(requiresMandatoryReview({ ...baseItem, owner_id: null }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when no due_at AND no due_trigger', () => {
    expect(requiresMandatoryReview({ ...baseItem, due_at: null, due_trigger: null }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when inaudible_pct > 0.30', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, inaudible_pct: 0.35 }, owner)).toBe(true);
  });
});
