import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

export type InboxItemKind =
  | 'ambiguous_match'
  | 'ambiguous_stage'
  | 'missing_decision'
  | 'resurfaced_skip'
  | 'proposed_pending';

export interface InboxItem {
  kind: InboxItemKind;
  id: string;                          // review_row id, tender id, or decision id (kind-dependent)
  agency: string;
  description: string | null;
  // For review-row kinds
  upload_id?: string | null;
  candidates?: Array<{ tender_id: string; score: number; snapshot: { id: string; description: string; agency: string; stage: string } | null }>;
  // For missing_decision
  tender_id?: string;
  stage?: string | null;
  last_seen_upload_at?: string | null;
  // For proposed_pending
  proposed_decision_type?: string;
  proposed_reason_code?: string | null;
  // Common
  created_at: string;                  // surfaced timestamp for sort
}

export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const isMinistry = (session.user.role) === 'superadmin';
  const agencyFilter = isMinistry ? null : session.user.agency?.toUpperCase() ?? null;

  try {
    // Most recent applied upload — used to identify resurfaced skips.
    const { data: latestUpload } = await supabaseAdmin
      .from('upload')
      .select('id')
      .eq('status', 'applied')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestUploadId = latestUpload?.id as string | null;

    const [reviewsRes, missingRes, proposedRes] = await Promise.all([
      // Pending reviews + skipped reviews (for resurfaced detection)
      (() => {
        let q = supabaseAdmin
          .from('tender_match_review')
          .select('id, upload_id, incoming_row, status, review_reason, candidate_tender_ids, scores, seen_in_uploads, created_at')
          .in('status', ['pending', 'skipped']);
        return q;
      })(),
      // Missing-pending-decision tenders
      (() => {
        let q = supabaseAdmin
          .from('tender')
          .select('id, agency, description, stage, updated_at, last_seen_upload_id')
          .eq('status', 'missing_pending_decision');
        if (agencyFilter) q = q.eq('agency', agencyFilter);
        return q;
      })(),
      // Proposed-but-not-approved decisions (Phase 3 surface; usually empty today)
      (() => {
        let q = supabaseAdmin
          .from('procurement_decision')
          .select('id, decision_type, reason_code, agency, decided_at, target_id, target_kind')
          .eq('approval_state', 'proposed')
          .order('decided_at', { ascending: false });
        if (agencyFilter) q = q.eq('agency', agencyFilter);
        return q;
      })(),
    ]);

    if (reviewsRes.error) throw reviewsRes.error;
    if (missingRes.error) throw missingRes.error;
    if (proposedRes.error) throw proposedRes.error;

    const items: InboxItem[] = [];

    // Review rows: split into ambiguous_match / ambiguous_stage / resurfaced_skip.
    // Hydrate candidate snapshots in one batch query.
    const reviewRows = reviewsRes.data || [];
    const candidateIds = Array.from(
      new Set(
        reviewRows.flatMap((r) => (r.candidate_tender_ids as string[] | null) ?? []),
      ),
    );
    let candidateById = new Map<string, { id: string; description: string; agency: string; stage: string }>();
    if (candidateIds.length > 0) {
      const { data: candData } = await supabaseAdmin
        .from('tender')
        .select('id, description, agency, stage')
        .in('id', candidateIds);
      candidateById = new Map(
        (candData || []).map((t) => [t.id as string, {
          id: t.id as string,
          description: t.description as string,
          agency: t.agency as string,
          stage: t.stage as string,
        }]),
      );
    }

    for (const row of reviewRows) {
      const inc = row.incoming_row as Record<string, unknown> | null;
      const rowAgency = (inc?.agency as string) || '';
      if (agencyFilter && rowAgency.toUpperCase() !== agencyFilter) continue;

      const candidates = ((row.candidate_tender_ids as string[] | null) ?? []).map((tid) => {
        const score = (row.scores as Record<string, number> | null)?.[tid] ?? 0;
        return { tender_id: tid, score, snapshot: candidateById.get(tid) ?? null };
      });

      if (row.status === 'pending') {
        items.push({
          kind: row.review_reason === 'ambiguous_stage' ? 'ambiguous_stage' : 'ambiguous_match',
          id: row.id as string,
          agency: rowAgency,
          description: (inc?.description as string) ?? null,
          upload_id: row.upload_id as string,
          candidates,
          created_at: row.created_at as string,
        });
      } else if (
        row.status === 'skipped' &&
        latestUploadId &&
        ((row.seen_in_uploads as string[] | null) ?? []).includes(latestUploadId)
      ) {
        // Skipped (defer) row that reappeared in the latest upload — surface as
        // resurfaced_skip so the user can re-decide. Permanent-ignore rows are
        // dropped at the parse boundary and never reach this state.
        items.push({
          kind: 'resurfaced_skip',
          id: row.id as string,
          agency: rowAgency,
          description: (inc?.description as string) ?? null,
          upload_id: row.upload_id as string,
          candidates,
          created_at: row.created_at as string,
        });
      }
    }

    for (const t of missingRes.data || []) {
      items.push({
        kind: 'missing_decision',
        id: t.id as string,
        agency: t.agency as string,
        description: t.description as string,
        tender_id: t.id as string,
        stage: (t.stage as string) ?? null,
        last_seen_upload_at: null,
        created_at: t.updated_at as string,
      });
    }

    for (const p of proposedRes.data || []) {
      items.push({
        kind: 'proposed_pending',
        id: p.id as string,
        agency: p.agency as string,
        description: null,
        proposed_decision_type: p.decision_type as string,
        proposed_reason_code: (p.reason_code as string) ?? null,
        created_at: p.decided_at as string,
      });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ items, latest_upload_id: latestUploadId });
  } catch (err) {
    logger.error({ err }, 'Error fetching procurement inbox');
    return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 });
  }
}
