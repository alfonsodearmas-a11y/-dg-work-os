import type { UserStaffFields } from './types';
import type { MeetingType, Modality } from './constants';

export interface GateItem {
  confidence_overall: number;
  validation_failed: boolean;
  owner_id: string | null;
  due_at: Date | null;
  due_trigger: string | null;
}
export interface GateMeeting {
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  inaudible_pct: number;
}

// Hard-coded political-risk gate. Plan 5's earned-trust tracker runs AFTER
// this gate; the gate is the floor, never bypassed.
//
// Three distinct populations get mandatory review forever (spec §0 #12):
//   - is_agency_head=true            → 7 portfolio agency CEOs
//   - closure_mode='dg_managed'      → Minister, PS, parl_sec (ministry principals)
//   - role='dg'                      → DG themselves
export function requiresMandatoryReview(
  item: GateItem,
  meeting: GateMeeting,
  owner: UserStaffFields,
): boolean {
  if (meeting.detected_type === null) return true;
  if (meeting.detected_modality === null) return true;
  if (meeting.detected_type === 'agency' || meeting.detected_type === 'external') return true;
  if (meeting.detected_modality === 'in_person' || meeting.detected_modality === 'mixed') return true;
  if (owner.is_agency_head) return true;                 // 7 agency CEOs
  if (owner.closure_mode === 'dg_managed') return true;  // Minister, PS, parl_sec
  if (owner.role === 'superadmin') return true;          // superadmins themselves
  if (item.owner_id === null) return true;
  if (item.confidence_overall < 0.85) return true;
  if (item.validation_failed) return true;
  if (item.due_at === null && item.due_trigger === null) return true;
  if (meeting.inaudible_pct > 0.30) return true;
  return false;
}
