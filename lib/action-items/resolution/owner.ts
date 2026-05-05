import type { UserStaffFields } from '@/lib/action-items/types';

export interface ResolveOwnerInput {
  name_raw: string;
  confidence: number;
  attendees: UserStaffFields[];
  allUsers: UserStaffFields[];
}
export interface ResolveOwnerResult {
  owner_id: string | null;
  method: 'meeting_scoped' | 'global' | 'role' | 'unresolved';
}

const norm = (s: string) => s.trim().toLowerCase();

// Strict matching only. Either user.name (case-insensitive) or one of
// user.aliases (case-insensitive) must equal the raw exactly. No
// first-name uniqueness fallback, no Levenshtein, no startsWith.
// Silent fuzzy attribution is more dangerous than an unresolved item
// the reviewer fixes explicitly. See incident 2026-05-05: extraction
// 99049fe3 had owner_name_raw='Kezia Joseph' (not in users) silently
// resolved to Keisha Crighton via the prior first-name path.
function matchesUser(name: string, u: UserStaffFields): boolean {
  const n = norm(name);
  const candidates = [u.name, ...(u.aliases ?? [])].filter((x): x is string => !!x).map(norm);
  return candidates.includes(n);
}

export function resolveOwner(input: ResolveOwnerInput): ResolveOwnerResult {
  // Stage 1: meeting-scoped (exact name or alias match within attendees).
  const inMeeting = input.attendees.filter(u => matchesUser(input.name_raw, u));
  if (inMeeting.length === 1) return { owner_id: inMeeting[0].id, method: 'meeting_scoped' };

  // Stage 2: global exact match, only if confidence ≥0.95. The
  // single-token first-name fallback was removed after the 2026-05-05
  // incident — if Claude can't pin a specific person by name or alias,
  // the reviewer does so explicitly via the dropdown.
  if (input.confidence >= 0.95) {
    const exact = input.allUsers.filter(u => matchesUser(input.name_raw, u));
    if (exact.length === 1) return { owner_id: exact[0].id, method: 'global' };
  }
  return { owner_id: null, method: 'unresolved' };
}
