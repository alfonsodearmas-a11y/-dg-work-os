import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { INTEL_AGENCIES, type IntelAgency } from '@/lib/agencies';
import { computeRiskTier } from '@/lib/delayed-projects/types';
import {
  EVAL_DANGER_DAYS,
  EVAL_WARN_DAYS,
  evaluationDaysInStage,
  toTenderAgency,
} from '@/lib/procurement/queries';

/**
 * GET /api/intel/summary
 *
 * Batched counts for the /intel index agency picker. Two queries cover all
 * seven agencies — one for open tasks, one for delayed projects — and we
 * bucket in JS instead of fanning out a query per agency.
 */
export const dynamic = 'force-dynamic';

type AgencyKey = IntelAgency;

interface AgencySummary {
  agency: AgencyKey;
  openTasksCount: number;
  openTasksOverdue: number;
  delayedProjectsCount: number;
  evaluationTendersCount: number;
  // Tenders in evaluation > EVAL_WARN_DAYS days (14) — surfaced as the
  // "stale" callout chip on each tile.
  evaluationTendersStale: number;
  // Tenders in evaluation > EVAL_DANGER_DAYS days (30) — used by the
  // status-dot classifier to flag agencies as critical.
  evaluationTendersCritical: number;
}

const OPEN_STATUSES = ['new', 'active', 'blocked'];

function emptyBucket(): Record<AgencyKey, AgencySummary> {
  const out = {} as Record<AgencyKey, AgencySummary>;
  for (const a of INTEL_AGENCIES) {
    out[a] = {
      agency: a,
      openTasksCount: 0,
      openTasksOverdue: 0,
      delayedProjectsCount: 0,
      evaluationTendersCount: 0,
      evaluationTendersStale: 0,
      evaluationTendersCritical: 0,
    };
  }
  return out;
}

export async function GET(_req: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const buckets = emptyBucket();
  // Map back from any storage value to the slug. Tasks/projects use the plain
  // uppercase code; tenders use the `tender_agency` enum, where HAS is stored
  // as `HINTERLAND_AIRSTRIPS`. Both inverse paths bucket back to the slug.
  const upperToLower: Record<string, AgencyKey> = {};
  const tenderAgencyToLower: Record<string, AgencyKey> = {};
  for (const a of INTEL_AGENCIES) {
    upperToLower[a.toUpperCase()] = a;
    tenderAgencyToLower[toTenderAgency(a)] = a;
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [tasksRes, projectsRes, evalTendersRes] = await Promise.all([
      supabaseAdmin
        .from('tasks')
        .select('agency, due_date')
        .in('status', OPEN_STATUSES)
        .in('agency', Object.keys(upperToLower)),
      supabaseAdmin
        .from('delayed_projects')
        .select('sub_agency, contract_value, completion_percent, project_end_date')
        .in('sub_agency', Object.keys(upperToLower)),
      supabaseAdmin
        .from('tender')
        .select('agency, date_advertised, date_closed')
        .eq('stage', 'evaluation')
        .in('agency', Object.keys(tenderAgencyToLower)),
    ]);

    if (tasksRes.error) {
      logger.error({ err: tasksRes.error }, '[/api/intel/summary] tasks query failed');
    } else {
      for (const row of tasksRes.data ?? []) {
        const slug = upperToLower[(row.agency as string)?.toUpperCase()];
        if (!slug) continue;
        buckets[slug].openTasksCount++;
        const due = row.due_date as string | null;
        if (due && due < today) buckets[slug].openTasksOverdue++;
      }
    }

    if (projectsRes.error) {
      logger.error({ err: projectsRes.error }, '[/api/intel/summary] projects query failed');
    } else {
      for (const row of projectsRes.data ?? []) {
        const slug = upperToLower[(row.sub_agency as string)?.toUpperCase()];
        if (!slug) continue;
        const tier = computeRiskTier(
          (row.project_end_date as string | null) ?? null,
          Number(row.completion_percent) || 0,
          Number(row.contract_value) || 0,
        );
        if (tier === 'HIGH' || tier === 'MEDIUM') buckets[slug].delayedProjectsCount++;
      }
    }

    if (evalTendersRes.error) {
      logger.error(
        { err: evalTendersRes.error },
        '[/api/intel/summary] evaluation tenders query failed',
      );
    } else {
      for (const row of evalTendersRes.data ?? []) {
        const slug = tenderAgencyToLower[(row.agency as string)?.toUpperCase()];
        if (!slug) continue;
        const days = evaluationDaysInStage({
          date_closed: (row.date_closed as string | null) ?? null,
          date_advertised: (row.date_advertised as string | null) ?? null,
        });
        buckets[slug].evaluationTendersCount++;
        if (days != null && days > EVAL_WARN_DAYS) buckets[slug].evaluationTendersStale++;
        if (days != null && days > EVAL_DANGER_DAYS) buckets[slug].evaluationTendersCritical++;
      }
    }

    return NextResponse.json(
      { agencies: Object.values(buckets) },
      {
        headers: {
          'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (err) {
    logger.error({ err }, '[/api/intel/summary] unexpected failure');
    return NextResponse.json({ agencies: Object.values(buckets) }, { status: 200 });
  }
}
