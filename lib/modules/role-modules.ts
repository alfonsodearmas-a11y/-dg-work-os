// Pure role-based module resolution. Role (+ agency) is the ONLY determinant —
// no per-user grants, denies, or toggles. Replaces lib/modules/access.ts and the
// user_module_access / modules tables. Client-safe: no server imports.
import { USER_AGENCIES, type UserAgency } from '@/lib/constants/agencies';

/** Modules every agency_manager gets; data inside each is agency-scoped by the data layer. */
const COMMON_MODULES = [
  'briefing', // Mission Control — required for every agency_manager
  'agency-intel',
  'tasks',
  'oversight',
  'budget',
  'meetings',
  'calendar',
  'documents',
  'procurement',
  'applications',
] as const;

/** Agency-specific modules (deep dives + agency tools). */
const AGENCY_MODULES: Record<UserAgency, readonly string[]> = {
  GPL: ['gpl-deep-dive', 'grid-health'],
  GWI: ['gwi-deep-dive'],
  CJIA: ['cjia-deep-dive'],
  GCAA: ['gcaa-deep-dive'],
  HECI: ['heci-deep-dive'],
  MARAD: ['marad-deep-dive'],
  HAS: ['airstrips'],
};

/** Superadmin-only modules. */
const SUPERADMIN_MODULES = [
  'action-items',
  'nptab-reports',
  'minister-attention',
  'projects', // PSIP tracker (/projects) — superadmin-only today (no modules row; only the role bypass admitted it)
  'hinterland-communities', // phase 1 superadmin-only; move/add to AGENCY_MODULES.GWI to expose to a GWI manager
  'people',
  'settings',
] as const;

export const ALL_MODULES: readonly string[] = [
  ...COMMON_MODULES,
  ...USER_AGENCIES.flatMap(a => AGENCY_MODULES[a]),
  ...SUPERADMIN_MODULES,
];

export function modulesForUser(
  role: string | null | undefined,
  agency: string | null | undefined,
): string[] {
  if (role === 'superadmin') return [...ALL_MODULES];
  if (role === 'agency_manager') {
    const key = (agency || '').toUpperCase() as UserAgency;
    return [...COMMON_MODULES, ...(AGENCY_MODULES[key] ?? [])];
  }
  return []; // 'system', unknown, or missing role → nothing
}

export function canAccessModule(
  role: string | null | undefined,
  agency: string | null | undefined,
  slug: string,
): boolean {
  return modulesForUser(role, agency).includes(slug);
}

/** Edit follows access — role is the only determinant; per-user can_edit is gone. */
export const canEditModule = canAccessModule;
