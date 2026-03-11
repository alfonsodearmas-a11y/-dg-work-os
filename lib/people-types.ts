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
  minister: 7,
  ps: 6,
  dg: 5,
  agency_admin: 3,
  officer: 2,
};

/** Formal display labels for each role — use these in all user-facing UI */
export const ROLE_LABELS: Record<Role, string> = {
  dg: 'Director General',
  minister: 'Minister',
  ps: 'Permanent Secretary',
  agency_admin: 'Agency Manager',
  officer: 'Analyst',
};

/** Role badge colors for people list and badges */
export const ROLE_COLORS: Record<string, string> = {
  dg: 'bg-gold-500/20 text-gold-500 border border-gold-500/30',
  minister: 'bg-amber-500/20 text-amber-300 border border-amber-400/30',
  ps: 'bg-slate-400/20 text-slate-300 border border-slate-400/30',
  agency_admin: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  officer: 'bg-navy-700/20 text-slate-400 border border-navy-700/30',
};

/** All role options for dropdowns */
export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'minister', label: 'Minister' },
  { value: 'ps', label: 'Permanent Secretary' },
  { value: 'dg', label: 'Director General' },
  { value: 'agency_admin', label: 'Agency Manager' },
  { value: 'officer', label: 'Analyst' },
];

/** Ministry-level roles (full system access, no agency restriction) */
export const MINISTRY_ROLES: readonly string[] = ['dg', 'minister', 'ps'] as const;

/** Senior roles that only DG can assign via invite */
export const SENIOR_INVITE_ROLES: readonly string[] = ['minister', 'ps', 'dg'] as const;

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  dg: 'System administrator. Full access. Can view all data, manage all users, change any settings.',
  minister: 'Highest authority. Full system access and visibility across all agencies.',
  ps: 'System-wide manager. View all data across agencies, manage dashboards, assign lower roles.',
  agency_admin: 'Manages specific agency. Full visibility and control of agency metrics, reports, and team tasks.',
  officer: 'Content creator. Create and edit dashboards, reports, and tasks. Access to assigned objects only.',
};

export const MPUA_AGENCIES = [
  { value: 'gpl', label: 'GPL — Guyana Power & Light' },
  { value: 'gwi', label: 'GWI — Guyana Water Inc' },
  { value: 'cjia', label: 'CJIA — Cheddi Jagan International Airport' },
  { value: 'gcaa', label: 'GCAA — Guyana Civil Aviation Authority' },
  { value: 'marad', label: 'MARAD — Maritime Administration' },
  { value: 'heci', label: 'HECI — Hinterland Electrification Company' },
  { value: 'has', label: 'HAS — Hinterland Airstrips' },
];
