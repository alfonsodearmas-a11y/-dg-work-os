// ── Today v1 signal orchestrator ─────────────────────────────────────────────
//
// Builds the prioritized attention list for the home page from three sources:
//   1. Delayed projects  — HIGH-risk ∪ stalled (|Δ| < 1pp between latest 2 snaps)
//   2. Tender SLA breaches
//   3. Open meeting action items (ministry roles only — see scoping note below)
//
// Agency scoping:
//   - Ministry roles (dg, minister, ps, parl_sec) see everything.
//   - agency_admin / officer are scoped to their own agency. Meeting actions
//     have no agency column (meetings table is ministry-wide), so agency
//     users see zero meeting actions in v1 — documented at the fetcher.

import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { MINISTRY_ROLES } from '@/lib/people-types';
import type { Role } from '@/lib/auth';
import { getProjects } from '@/lib/delayed-projects/queries';
import { enrichProject } from '@/lib/delayed-projects/types';
import type { DelayedProject, DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { listTenders } from '@/lib/tender/queries';
import { STAGE_CONFIG } from '@/lib/tender/types';
import type { Tender } from '@/lib/tender/types';
import {
  severityForDelayedProject,
  severityForTenderSla,
  severityForMeetingAction,
  severityForStagnantTender,
  severityForAgencyStagnantRollup,
  severityForIncompletePsip,
  daysOverSla,
  daysBetweenDates,
  severityRank,
} from './severity';
import type { TodayPayload, TodaySignal } from './types';
import { TODAY_THRESHOLDS } from './thresholds';

// A project is "stalled" when its completion_percent changed by less than
// 1 percentage point between the two most recent delayed_project_snapshots
// rows. Bounded to the two most recent global snapshot_dates to avoid
// scanning the full history table on every request.

export async function getStalledProjectIds(): Promise<string[]> {
  const { data: dateRows, error: dateErr } = await supabaseAdmin
    .from('delayed_project_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false });

  if (dateErr) {
    logger.error({ error: dateErr }, 'getStalledProjectIds: snapshot_date query failed');
    return [];
  }

  const uniqueDates = Array.from(new Set((dateRows || []).map((r) => r.snapshot_date as string)));
  if (uniqueDates.length < 2) return [];
  const [currentDate, previousDate] = uniqueDates;

  const { data: snapRows, error: snapErr } = await supabaseAdmin
    .from('delayed_project_snapshots')
    .select('project_id, completion_percent, snapshot_date')
    .in('snapshot_date', [currentDate, previousDate]);

  if (snapErr) {
    logger.error({ error: snapErr }, 'getStalledProjectIds: snapshot query failed');
    return [];
  }

  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const r of (snapRows || []) as { project_id: string; completion_percent: number | null; snapshot_date: string }[]) {
    const pct = r.completion_percent ?? 0;
    if (r.snapshot_date === currentDate) current.set(r.project_id, pct);
    else if (r.snapshot_date === previousDate) previous.set(r.project_id, pct);
  }

  const stalled: string[] = [];
  for (const [pid, currPct] of current) {
    const prevPct = previous.get(pid);
    if (prevPct === undefined) continue;
    if (Math.abs(currPct - prevPct) < 1) stalled.push(pid);
  }

  return stalled;
}

// ── Scoping helper ───────────────────────────────────────────────────────────

function scopedAgency(role: Role, agency: string | null): string | undefined {
  return MINISTRY_ROLES.includes(role) ? undefined : (agency ?? undefined);
}

// Per-source fetch limit; also the final cap on the merged list.
const FETCH_LIMIT = 50;

// ── 1. Delayed-project signals ───────────────────────────────────────────────

export async function fetchDelayedProjectSignals(
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<TodaySignal[]> {
  const agencyFilter = scopedAgency(role, agency);

  const [highResult, stalledIds] = await Promise.all([
    getProjects(
      { risk_tiers: ['HIGH'], sort: 'overdue', sort_dir: 'desc', limit: FETCH_LIMIT },
      agencyFilter,
    ),
    getStalledProjectIds(),
  ]);

  const byId = new Map<string, DelayedProjectWithComputed>();
  for (const p of highResult.projects) byId.set(p.id, p);

  const missingStalled = stalledIds.filter((id) => !byId.has(id));
  if (missingStalled.length > 0) {
    let q = supabaseAdmin.from('delayed_projects').select('*').in('id', missingStalled);
    if (agencyFilter) q = q.eq('sub_agency', agencyFilter);
    const { data: extra, error } = await q;
    if (error) {
      logger.warn({ error }, 'fetchDelayedProjectSignals: stalled backfill failed');
    } else {
      for (const row of (extra || []) as DelayedProject[]) {
        byId.set(row.id, enrichProject(row));
      }
    }
  }

  const stalledSet = new Set(stalledIds);
  const signals: TodaySignal[] = [];

  for (const p of byId.values()) {
    const isStalled = stalledSet.has(p.id);
    const severity = severityForDelayedProject(p.days_overdue);
    const metric = buildDelayedMetric(p, isStalled);

    signals.push({
      id: `delayed_project:${p.id}`,
      kind: 'delayed_project',
      severity,
      title: p.project_name || 'Unnamed project',
      subtitle: p.sub_agency || null,
      metric,
      href: `/oversight?project=${p.id}`,
      agency: p.sub_agency || null,
      sourceId: p.id,
      dueDate: p.project_end_date,
      ageDays: p.days_overdue ?? null,
      computedAt: now.toISOString(),
    });
  }

  return signals;
}

function buildDelayedMetric(p: DelayedProjectWithComputed, isStalled: boolean): string {
  const parts: string[] = [];
  if (p.days_overdue !== null && p.days_overdue > 0) {
    parts.push(`${p.days_overdue}d overdue`);
  }
  parts.push(`${Math.round(p.completion_percent)}% complete`);
  if (isStalled) parts.push('stalled');
  return parts.join(' · ');
}

// Procurement detail drawer deep-link: ProcurementKanban's URL-sync reads
// `?tender=<id>` on mount (mirror of Oversight's `?project=`). A path-style
// /procurement/<id> has no route and 404s.
const tenderHref = (id: string) => `/procurement?tender=${id}`;

// ── 2. Tender SLA signals ────────────────────────────────────────────────────

export async function fetchTenderSlaSignals(
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<TodaySignal[]> {
  const tenders = await listTenders({ agency: scopedAgency(role, agency) });

  const signals: TodaySignal[] = [];
  for (const t of tenders) {
    // Skip stages with no SLA, flagged tenders, and rows with no computable
    // days-in-stage (required PSIP date missing — not a breach, just unknown).
    if (t.stage === 'award' || t.is_rollover || t.has_exception) continue;
    if (t.days_at_current_stage === null) continue;
    const over = daysOverSla(t.stage, t.days_at_current_stage);
    if (over === null || over <= 0) continue;

    const severity = severityForTenderSla(over);
    signals.push({
      id: `tender_sla:${t.id}`,
      kind: 'tender_sla',
      severity,
      title: t.description,
      subtitle: t.agency_name ?? t.agency,
      metric: formatTenderMetric(t, over),
      href: tenderHref(t.id),
      agency: t.agency,
      sourceId: t.id,
      dueDate: null,
      ageDays: over,
      computedAt: now.toISOString(),
    });
  }

  return signals;
}

function formatTenderMetric(t: Tender, daysOver: number): string {
  // days_at_current_stage is guaranteed non-null here — callers filter null before invoking.
  return `${t.days_at_current_stage!}d in ${STAGE_CONFIG[t.stage].label} · ${daysOver}d over SLA`;
}

// ── 3. Meeting action signals ────────────────────────────────────────────────
// Why agency users see nothing: meetings and meeting_actions have no agency
// FK, and meeting_actions.owner is free-text rather than a user_id, so there
// is no reliable way to scope to an agency. Revisit when meetings gain scope.

export async function fetchMeetingActionSignals(
  role: Role,
  _agency: string | null,
  now: Date = new Date(),
): Promise<TodaySignal[]> {
  if (!MINISTRY_ROLES.includes(role)) return [];

  const { data, error } = await supabaseAdmin
    .from('meeting_actions')
    .select('id, task, owner, due_date, done, skipped, meeting_id, created_at, meetings(id, title)')
    .eq('done', false)
    .eq('skipped', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(FETCH_LIMIT);

  if (error) {
    logger.error({ error }, 'fetchMeetingActionSignals: query failed');
    throw error;
  }

  type Row = {
    id: string;
    task: string;
    owner: string | null;
    due_date: string | null;
    meeting_id: string;
    created_at: string;
    meetings: { id: string; title: string } | { id: string; title: string }[] | null;
  };

  const rows = (data || []) as unknown as Row[];
  const nowISO = now.toISOString();
  const signals: TodaySignal[] = [];

  for (const r of rows) {
    const daysPastDue = r.due_date ? daysBetweenDates(r.due_date, nowISO) : null;
    const daysSinceCreated = daysBetweenDates(r.created_at, nowISO);

    const severity = severityForMeetingAction({ daysPastDue, daysSinceCreated });
    if (severity === null) continue;

    const meeting = Array.isArray(r.meetings) ? r.meetings[0] : r.meetings;
    const meetingTitle = meeting?.title ?? 'Meeting';

    signals.push({
      id: `meeting_action:${r.id}`,
      kind: 'meeting_action',
      severity,
      title: r.task,
      subtitle: meetingTitle,
      metric: formatMeetingMetric({ daysPastDue, daysSinceCreated, owner: r.owner }),
      href: `/meetings?id=${r.meeting_id}`,
      agency: null,
      sourceId: r.id,
      dueDate: r.due_date,
      ageDays: daysPastDue !== null && daysPastDue > 0 ? daysPastDue : null,
      computedAt: nowISO,
    });
  }

  return signals;
}

function formatMeetingMetric(input: {
  daysPastDue: number | null;
  daysSinceCreated: number;
  owner: string | null;
}): string {
  const { daysPastDue, daysSinceCreated, owner } = input;
  const ownerPart = owner ? ` · ${owner}` : '';
  if (daysPastDue !== null) {
    if (daysPastDue > 0) return `${daysPastDue}d past due${ownerPart}`;
    if (daysPastDue === 0) return `due today${ownerPart}`;
    return `due in ${Math.abs(daysPastDue)}d${ownerPart}`;
  }
  return `no due date · open ${daysSinceCreated}d${ownerPart}`;
}

// ── 4. Stagnant-tender signals ───────────────────────────────────────────────
// Fires individual stagnant_tender signals for tenders with stagnant_weeks ≥ 3,
// and collapses them into agency_stagnant_rollup signals when a single agency
// has ≥ 3 stagnant tenders. Rollups suppress their constituent individual
// signals (one signal per agency instead of 3–N separate cards).

interface StagnantTenderRow {
  id: string;
  description: string;
  agency: string;
  stage: string;
  stagnant_weeks: number;
  updated_at: string;
}

export async function fetchStagnantTenderSignals(
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<TodaySignal[]> {
  const scope = scopedAgency(role, agency);

  let q = supabaseAdmin
    .from('tender')
    .select('id, description, agency, stage, stagnant_weeks, updated_at')
    .gte('stagnant_weeks', TODAY_THRESHOLDS.stagnant_tender.min_weeks)
    .eq('is_rollover', false)
    .eq('has_exception', false)
    .eq('missing_from_last_upload', false);
  if (scope) q = q.eq('agency', scope.toUpperCase());

  const { data, error } = await q;
  if (error) {
    logger.error({ error }, 'fetchStagnantTenderSignals: query failed');
    throw error;
  }

  const rows = (data || []) as StagnantTenderRow[];

  // Per-agency count to decide whether to emit individuals or the rollup.
  const countByAgency = new Map<string, number>();
  for (const r of rows) countByAgency.set(r.agency, (countByAgency.get(r.agency) || 0) + 1);

  const rolledUpAgencies = new Set<string>();
  for (const [a, n] of countByAgency) {
    if (n >= TODAY_THRESHOLDS.agency_stagnant_rollup.min_count) rolledUpAgencies.add(a);
  }

  const nowISO = now.toISOString();
  const signals: TodaySignal[] = [];

  // Individual stagnant_tender signals — only for agencies NOT rolled up.
  for (const r of rows) {
    if (rolledUpAgencies.has(r.agency)) continue;
    signals.push({
      id: `stagnant_tender:${r.id}`,
      kind: 'stagnant_tender',
      severity: severityForStagnantTender(r.stagnant_weeks),
      title: r.description,
      subtitle: `${r.agency} · stage: ${r.stage}`,
      metric: `No PSIP change in ${r.stagnant_weeks} ${r.stagnant_weeks === 1 ? 'week' : 'weeks'}`,
      href: tenderHref(r.id),
      agency: r.agency,
      sourceId: r.id,
      dueDate: null,
      ageDays: r.stagnant_weeks * 7,
      computedAt: nowISO,
    });
  }

  // Agency rollup signals.
  for (const a of rolledUpAgencies) {
    const agencyRows = rows.filter((r) => r.agency === a);
    const count = agencyRows.length;
    const maxWeeks = Math.max(...agencyRows.map((r) => r.stagnant_weeks));
    signals.push({
      id: `agency_stagnant_rollup:${a}`,
      kind: 'agency_stagnant_rollup',
      severity: severityForAgencyStagnantRollup(count),
      title: `${a} has ${count} stagnant tenders`,
      subtitle: 'Unchanged for 3+ weeks on the PSIP',
      metric: `Longest stagnation: ${maxWeeks} ${maxWeeks === 1 ? 'week' : 'weeks'}`,
      href: `/procurement?agency=${a}&stagnant=true`,
      agency: a,
      sourceId: a,
      dueDate: null,
      ageDays: maxWeeks * 7,
      computedAt: nowISO,
    });
  }

  return signals;
}

// ── 5. Incomplete-PSIP-data signals ──────────────────────────────────────────
// One rollup per agency that has ≥ min_count tenders whose stage is
// SLA-eligible (advertised / evaluation / awaiting_award) but the required
// date column is NULL, so days-in-stage cannot be computed. These tenders
// are silently skipped by fetchTenderSlaSignals; this signal surfaces the
// data-quality gap so the agency can fill in the PSIP.

type IncompletePsipRow = {
  id: string;
  agency: string;
  stage: string;
  created_at: string;
  date_advertised: string | null;
  date_closed: string | null;
  date_eval_sent_mtb_rtb: string | null;
  date_eval_sent_nptab: string | null;
};

function isMissingRequiredDate(row: IncompletePsipRow): boolean {
  switch (row.stage) {
    case 'advertised':
      return row.date_advertised === null;
    case 'evaluation':
      return row.date_closed === null;
    case 'awaiting_award':
      return row.date_eval_sent_nptab === null
        && row.date_eval_sent_mtb_rtb === null
        && row.date_closed === null;
    default:
      return false;
  }
}

export async function fetchIncompletePsipDataSignals(
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<TodaySignal[]> {
  const scope = scopedAgency(role, agency);

  let q = supabaseAdmin
    .from('tender')
    .select('id, agency, stage, created_at, date_advertised, date_closed, date_eval_sent_mtb_rtb, date_eval_sent_nptab')
    .in('stage', ['advertised', 'evaluation', 'awaiting_award'])
    .eq('is_rollover', false)
    .eq('has_exception', false)
    .eq('missing_from_last_upload', false);
  if (scope) q = q.eq('agency', scope.toUpperCase());

  const { data, error } = await q;
  if (error) {
    logger.error({ error }, 'fetchIncompletePsipDataSignals: query failed');
    throw error;
  }

  const rows = ((data || []) as IncompletePsipRow[]).filter(isMissingRequiredDate);
  if (rows.length === 0) return [];

  const byAgency = new Map<string, IncompletePsipRow[]>();
  for (const r of rows) {
    const bucket = byAgency.get(r.agency) ?? [];
    bucket.push(r);
    byAgency.set(r.agency, bucket);
  }

  const nowISO = now.toISOString();
  const nowMs = now.getTime();
  const signals: TodaySignal[] = [];

  for (const [a, agencyRows] of byAgency) {
    const count = agencyRows.length;
    if (count < TODAY_THRESHOLDS.incomplete_psip.min_count) continue;
    const maxAgeDays = Math.max(
      ...agencyRows.map((r) =>
        Math.max(0, Math.floor((nowMs - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24))),
      ),
    );
    signals.push({
      id: `incomplete_psip:${a}`,
      kind: 'incomplete_psip_data',
      severity: severityForIncompletePsip(count),
      title: `${a} has ${count} ${count === 1 ? 'tender' : 'tenders'} missing PSIP dates`,
      subtitle: 'Dates required for SLA tracking are not filled in',
      metric: `${count} ${count === 1 ? 'tender' : 'tenders'}`,
      href: `/procurement?agency=${a}&missing_dates=true`,
      agency: a,
      sourceId: a,
      dueDate: null,
      ageDays: maxAgeDays,
      computedAt: nowISO,
    });
  }

  return signals;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

// Tiebreak when severity and ageDays match.
const KIND_RANK: Record<TodaySignal['kind'], number> = {
  delayed_project: 0,
  tender_sla: 1,
  agency_stagnant_rollup: 2,
  stagnant_tender: 3,
  incomplete_psip_data: 4,
  meeting_action: 5,
};

export async function getTodaySignals(
  _userId: string,
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<TodayPayload> {
  const [delayedResult, tenderResult, meetingResult, stagnantResult, incompleteResult] = await Promise.allSettled([
    fetchDelayedProjectSignals(role, agency, now),
    fetchTenderSlaSignals(role, agency, now),
    fetchMeetingActionSignals(role, agency, now),
    fetchStagnantTenderSignals(role, agency, now),
    fetchIncompletePsipDataSignals(role, agency, now),
  ]);

  const sources: TodayPayload['sources'] = {
    delayed_projects: healthFrom(delayedResult),
    tenders: healthFrom(tenderResult),
    meeting_actions: healthFrom(meetingResult),
    stagnant_tenders: healthFrom(stagnantResult),
    incomplete_psip: healthFrom(incompleteResult),
  };

  const all: TodaySignal[] = [
    ...(delayedResult.status === 'fulfilled' ? delayedResult.value : []),
    ...(tenderResult.status === 'fulfilled' ? tenderResult.value : []),
    ...(meetingResult.status === 'fulfilled' ? meetingResult.value : []),
    ...(stagnantResult.status === 'fulfilled' ? stagnantResult.value : []),
    ...(incompleteResult.status === 'fulfilled' ? incompleteResult.value : []),
  ];

  all.sort((a, b) => {
    const s = severityRank(a.severity) - severityRank(b.severity);
    if (s !== 0) return s;
    const aAge = a.ageDays ?? -Infinity;
    const bAge = b.ageDays ?? -Infinity;
    if (aAge !== bAge) return bAge - aAge;
    return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  });

  const signals = all.slice(0, FETCH_LIMIT);

  const counts = { critical: 0, high: 0, medium: 0, total: signals.length };
  for (const s of signals) counts[s.severity]++;

  return {
    signals,
    counts,
    sources,
    generatedAt: now.toISOString(),
  };
}

function healthFrom<T>(r: PromiseSettledResult<T>): { ok: boolean; error?: string } {
  if (r.status === 'fulfilled') return { ok: true };
  const msg = (r.reason as { message?: string } | undefined)?.message ?? 'unknown error';
  logger.error({ reason: r.reason }, 'today-signal fetcher failed');
  return { ok: false, error: msg };
}
