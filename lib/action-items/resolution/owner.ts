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

function matchesUser(name: string, u: UserStaffFields): boolean {
  const n = norm(name);
  const candidates = [u.name, ...(u.aliases ?? [])].filter((x): x is string => !!x).map(norm);
  return candidates.includes(n);
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return norm(name).split(/\s+/)[0] ?? null;
}

export function resolveOwner(input: ResolveOwnerInput): ResolveOwnerResult {
  // Stage 1: meeting-scoped (exact name or alias match within attendees)
  const inMeeting = input.attendees.filter(u => matchesUser(input.name_raw, u));
  if (inMeeting.length === 1) return { owner_id: inMeeting[0].id, method: 'meeting_scoped' };

  // Stage 2: global, only if confidence ≥0.95.
  // For single-token raws ("Kesh"), require first-name uniqueness across ALL users —
  // alias-match alone isn't enough if another user shares that first name.
  if (input.confidence >= 0.95) {
    const tokens = norm(input.name_raw).split(/\s+/);
    if (tokens.length === 1) {
      const fn = tokens[0];
      const candidates = input.allUsers.filter(u =>
        matchesUser(input.name_raw, u) || firstName(u.name) === fn,
      );
      if (candidates.length === 1) return { owner_id: candidates[0].id, method: 'global' };
    } else {
      const exact = input.allUsers.filter(u => matchesUser(input.name_raw, u));
      if (exact.length === 1) return { owner_id: exact[0].id, method: 'global' };
    }
  }
  return { owner_id: null, method: 'unresolved' };
}
