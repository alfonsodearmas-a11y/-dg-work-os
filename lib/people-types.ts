import type { Role } from './auth';

export type { Role };

export type AccessLevel = 'view' | 'edit' | 'manage';
export type ActionResult = 'success' | 'denied' | 'error';

export interface CorePermission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  is_admin_only: boolean;
}

export interface RoleRecord {
  id: string;
  name: Role;
  display_name: string;
  description: string;
  hierarchy_level: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleWithPermissions extends RoleRecord {
  permissions: CorePermission[];
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  formal_title: string | null;
  avatar_url: string | null;
  agency: string | null;
  status: string | null;
  is_active: boolean;
  last_login: string | null;
  last_seen_at: string | null;
  login_count: number | null;
  invited_at: string | null;
  first_login_at: string | null;
  created_at: string;
}

export interface ObjectAccessGrant {
  id: string;
  user_id: string;
  object_type: string;
  object_id: string | null;
  access_level: AccessLevel;
  reason: string | null;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  object_name: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  result: ActionResult;
  denial_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  superadmin: 7,
  agency_manager: 3,
};

/** Formal display labels for each role — prefer `title` (formal_title) in UI;
 *  these are the fallback when a user has no title set. */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super Admin',
  agency_manager: 'Agency Manager',
};

/** Role badge colors for people list and badges */
export const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-gold-500/20 text-gold-500 border border-gold-500/30',
  agency_manager: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
};

/** All role options for dropdowns */
export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'agency_manager', label: 'Agency Manager' },
];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: 'Sees and does everything across all agencies. Title (DG, Minister, PS…) is display-only.',
  agency_manager: 'Sees and does everything for their own agency only.',
};

/** Display order for the permission matrix columns */
export const ROLE_DISPLAY_ORDER: Record<string, number> = {
  superadmin: 1, agency_manager: 2,
};

/** Title presets for the free-text title field (display-only; never gates access). */
export const TITLE_PRESETS: readonly string[] = [
  'Director General',
  'Minister',
  'Permanent Secretary',
  'Parliamentary Secretary',
  'Agency Manager',
  'Analyst',
] as const;


// Canonical UPPERCASE values per migration 106 (2026-05-05).
export const MPUA_AGENCIES = [
  { value: 'GPL', label: 'GPL — Guyana Power & Light' },
  { value: 'GWI', label: 'GWI — Guyana Water Inc' },
  { value: 'CJIA', label: 'CJIA — Cheddi Jagan International Airport' },
  { value: 'GCAA', label: 'GCAA — Guyana Civil Aviation Authority' },
  { value: 'MARAD', label: 'MARAD — Maritime Administration' },
  { value: 'HECI', label: 'HECI — Hinterland Electrification Company' },
  { value: 'HAS', label: 'HAS — Hinterland Airstrips' },
];
