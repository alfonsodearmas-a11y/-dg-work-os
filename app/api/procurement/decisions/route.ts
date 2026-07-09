import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

export interface DecisionLogRow {
  id: string;
  decision_type: string;
  target_kind: 'tender' | 'review_row';
  target_id: string;
  target_label: string | null;
  agency: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string;
  reason_code: string | null;
  reason_text: string | null;
  decided_at: string;
  approval_state: string;
}

/**
 * GET /api/procurement/decisions
 * Returns the procurement_decision ledger for the user's scope.
 * Ministry roles see all agencies; agency_admin/officer see their own.
 *
 * Output is enriched: actor.name and a target_label (tender description for
 * tender targets; incoming_row.description for review_row targets) are
 * resolved server-side so the UI is purely a renderer.
 */
export async function GET(request: Request) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

  try {
    const isMinistry = (session.user.role) === 'superadmin';
    const agencyFilter = isMinistry ? null : session.user.agency?.toUpperCase() ?? null;

    let query = supabaseAdmin
      .from('procurement_decision')
      .select('id, decision_type, target_kind, target_id, agency, actor_id, actor_role, reason_code, reason_text, decided_at, approval_state')
      .order('decided_at', { ascending: false })
      .limit(limit);
    if (agencyFilter) query = query.eq('agency', agencyFilter);

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) throw rowsErr;

    const decisions = rows ?? [];
    if (decisions.length === 0) return NextResponse.json({ decisions: [] });

    const tenderIds = decisions.filter((d) => d.target_kind === 'tender').map((d) => d.target_id as string);
    const reviewIds = decisions.filter((d) => d.target_kind === 'review_row').map((d) => d.target_id as string);
    const actorIds = Array.from(new Set(decisions.map((d) => d.actor_id as string)));

    const [tendersRes, reviewsRes, actorsRes] = await Promise.all([
      tenderIds.length
        ? supabaseAdmin.from('tender').select('id, description').in('id', tenderIds)
        : Promise.resolve({ data: [], error: null }),
      reviewIds.length
        ? supabaseAdmin.from('tender_match_review').select('id, incoming_row').in('id', reviewIds)
        : Promise.resolve({ data: [], error: null }),
      actorIds.length
        ? supabaseAdmin.from('users').select('id, name').in('id', actorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const tenderById = new Map<string, string>();
    for (const t of tendersRes.data || []) tenderById.set(t.id as string, (t.description as string) ?? null);
    const reviewById = new Map<string, string | null>();
    for (const r of reviewsRes.data || []) {
      const inc = r.incoming_row as Record<string, unknown> | null;
      reviewById.set(r.id as string, (inc?.description as string) ?? null);
    }
    const actorById = new Map<string, string>();
    for (const a of actorsRes.data || []) actorById.set(a.id as string, (a.name as string) ?? null);

    const enriched: DecisionLogRow[] = decisions.map((d) => ({
      id: d.id as string,
      decision_type: d.decision_type as string,
      target_kind: d.target_kind as 'tender' | 'review_row',
      target_id: d.target_id as string,
      target_label:
        d.target_kind === 'tender'
          ? tenderById.get(d.target_id as string) ?? null
          : reviewById.get(d.target_id as string) ?? null,
      agency: d.agency as string,
      actor_id: d.actor_id as string,
      actor_name: actorById.get(d.actor_id as string) ?? null,
      actor_role: d.actor_role as string,
      reason_code: (d.reason_code as string) ?? null,
      reason_text: (d.reason_text as string) ?? null,
      decided_at: d.decided_at as string,
      approval_state: d.approval_state as string,
    }));

    return NextResponse.json({ decisions: enriched });
  } catch (err) {
    logger.error({ err }, 'Error fetching procurement decisions');
    return NextResponse.json({ error: 'Failed to load decisions' }, { status: 500 });
  }
}
