// Direct Outreach UI — tiny shared display helpers.

import { AGENCY_HEX_COLORS, AGENCY_NAMES } from '@/lib/constants/agencies';
import type { OutreachWorkingStatus } from '@/lib/direct-outreach/types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

/** OP Direct 'PUA' is the ministry-level bucket — reuse the MPUA identity. */
export function outreachAgencyColor(agency: string | null | undefined): string {
  const code = (agency ?? '').toUpperCase();
  if (code === 'PUA') return AGENCY_HEX_COLORS.MPUA;
  return AGENCY_HEX_COLORS[code] ?? AGENCY_HEX_COLORS.MPUA;
}

export function outreachAgencyName(agency: string | null | undefined): string {
  const code = (agency ?? '').toUpperCase();
  if (code === 'PUA') return AGENCY_NAMES.MPUA;
  return AGENCY_NAMES[code] ?? code;
}

export const OUTREACH_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  Open: 'info',
  Referred: 'gold',
  'Follow Up': 'warning',
  'In Queue': 'default',
  Unreachable: 'warning',
  'Not Actionable': 'default',
  Resolved: 'success',
};

/** Initials for the officer avatar circle — the app-wide inline idiom. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Idle-day traffic light: green <30, amber 30-90, red >90; muted when unknown. */
export function idleColorClass(daysIdle: number | null | undefined): string {
  if (daysIdle == null) return 'text-navy-600';
  if (daysIdle > 90) return 'text-red-400';
  if (daysIdle >= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

/** Internal working-status badge variants (v3). */
export const WORKING_STATUS_VARIANTS: Record<OutreachWorkingStatus, BadgeVariant> = {
  not_started: 'default',
  in_progress: 'info',
  blocked: 'danger',
  resolved_pending_verification: 'success',
};

/** Officer-activity traffic light (v3, tighter than OP idle): green <7,
 *  amber 7-14, red >14; red also for null (unassigned & never updated). */
export function officerActionColorClass(days: number | null | undefined): string {
  if (days == null) return 'text-red-400';
  if (days > 14) return 'text-red-400';
  if (days >= 7) return 'text-amber-400';
  return 'text-emerald-400';
}
