// Pure helpers for the plain Agency Intel Report. No JSX, no react-pdf.
// Consumed by lib/pdf/intel-report-render.tsx, lib/intel/intel-report-view.tsx,
// and lib/intel/prepare-report.ts.
//
// Field-vs-record discipline: a missing field disappears from the row; a
// missing record never silently turns into a placeholder. Lede counts pick
// only what is present, not what is absent.

import type {
  AgencyIntelData,
  AgencyOpenTask,
} from '@/lib/intel/get-agency-intel-data';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import type { CriticalTenderRow } from '@/lib/procurement/queries';

const PLACEHOLDER_OWNER_RE =
  /^(tbd|pending|pending\s+assignment|unassigned|n\/?a|none|to\s+be\s+assigned|placeholder)$/i;

export function isPresentOwner(value: string | null | undefined): value is string {
  if (value == null) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !PLACEHOLDER_OWNER_RE.test(trimmed);
}

export function isExplicitPlaceholderOwner(value: string | null | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return PLACEHOLDER_OWNER_RE.test(trimmed);
}

const STAGE_LABELS: Record<string, string> = {
  design: 'Design',
  advertised: 'Advertised',
  evaluation: 'Evaluation',
  awaiting_award: 'Awaiting Award',
  award: 'Award',
};

export function stageLabel(stage: string | null | undefined): string {
  if (stage == null) return '';
  const known = STAGE_LABELS[stage];
  if (known) return known;
  return stage
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

const REASON_LABELS: Record<string, string> = {
  missing_pending_decision: 'Missing. Pending decision.',
  stale_award: 'Stale award.',
  missing_from_upload: 'Missing from latest upload.',
};

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  return REASON_LABELS[reason] ?? reason;
}

export type LedeStats = {
  openTasksTotal: number;
  openTasksOverdue: number;
  delayedProjectsTotal: number;
  delayedTotalDaysSlip: number;
  procurementTotal: number;
  procurementUnnamed: number;
};

export function computeLedeStats(data: AgencyIntelData): LedeStats {
  const tasks: AgencyOpenTask[] = data.open_tasks ?? [];
  const projects: DelayedProjectWithComputed[] = data.delayed_projects ?? [];
  const tenders: CriticalTenderRow[] = data.critical_procurement ?? [];

  const openTasksTotal = tasks.length;
  const openTasksOverdue = tasks.filter((t) => t.is_overdue === true).length;

  const delayedProjectsTotal = projects.length;
  const delayedTotalDaysSlip = projects.reduce(
    (sum, p) =>
      sum + (typeof p.days_overdue === 'number' && p.days_overdue > 0 ? p.days_overdue : 0),
    0,
  );

  const procurementTotal = tenders.length;
  // Count tenders whose owner is an explicit placeholder (TBD, pending,
  // unassigned, etc.). Do NOT count tenders whose owner is null — null is
  // absent data, not an unnamed assignment.
  const procurementUnnamed = tenders.filter((t) =>
    isExplicitPlaceholderOwner(t.next_action_owner),
  ).length;

  return {
    openTasksTotal,
    openTasksOverdue,
    delayedProjectsTotal,
    delayedTotalDaysSlip,
    procurementTotal,
    procurementUnnamed,
  };
}

// contract_value is stored as whole GYD dollars (not cents), per
// lib/excel-parser.ts parseCurrency which reads "$X,XXX,XXX" cells directly
// without scaling. The type comment in lib/delayed-projects/types.ts claims
// cents; the parser and renderers both treat it as dollars, and the displayed
// figures match Ministry reference numbers. Do not divide by 100 here.
export function formatGYD(value: number | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `GYD ${n.toLocaleString()}`;
}

export function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
