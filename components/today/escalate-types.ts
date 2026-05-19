// Source kinds the EscalateModal and ReferToMinisterDialog accept. Decouples
// these components from the legacy lib/referrals/types module which is being
// deleted as part of the Minister-attention collapse.
//
// 'task' is the flag-existing path (the task already lives in tasks; we set
// the minister-attention columns on it).
// 'tender' and 'project' create a new task and set linked_source_*.
// 'agency_issue' and 'other' create a new task without linked_source_*.
export type EscalateSourceType = 'tender' | 'project' | 'agency_issue' | 'task' | 'other';
