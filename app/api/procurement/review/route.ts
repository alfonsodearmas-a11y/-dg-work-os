import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/** GET /api/procurement/review — pending review rows across all uploads */
export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  try {
    const { data, error } = await supabaseAdmin
      .from('tender_match_review')
      .select('id, upload_id, incoming_row, candidate_tender_ids, scores, status, review_reason, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    // Join candidate descriptions.
    const allCandidateIds = new Set<string>();
    for (const row of data || []) {
      for (const id of (row.candidate_tender_ids as string[]) || []) allCandidateIds.add(id);
    }
    const candidateIdArr = Array.from(allCandidateIds);
    let candidatesById: Record<string, { id: string; description: string; agency: string; stage: string }> = {};
    if (candidateIdArr.length > 0) {
      const { data: cands } = await supabaseAdmin
        .from('tender')
        .select('id, description, agency, stage')
        .in('id', candidateIdArr);
      candidatesById = Object.fromEntries((cands || []).map((c) => [c.id as string, c as { id: string; description: string; agency: string; stage: string }]));
    }

    return NextResponse.json({
      reviews: (data || []).map((row) => ({
        ...row,
        review_reason: (row.review_reason as string) ?? 'ambiguous_match',
        candidates: ((row.candidate_tender_ids as string[]) || []).map((id) => ({
          tender_id: id,
          score: ((row.scores as Record<string, number>) || {})[id] ?? 0,
          snapshot: candidatesById[id] || null,
        })),
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Error listing review queue');
    return NextResponse.json({ error: 'Failed to list review queue' }, { status: 500 });
  }
}
