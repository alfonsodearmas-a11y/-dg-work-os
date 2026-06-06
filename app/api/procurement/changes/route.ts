import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/procurement/changes — the "what moved this week" feed.
 * Defaults to the most recent applied upload. Returns groups of tenders
 * whose fields changed, scoped to that upload. Stage changes first.
 */
export async function GET(request: Request) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  try {
    const url = new URL(request.url);
    const uploadId = url.searchParams.get('upload_id');

    let upload_id = uploadId;
    if (!upload_id) {
      const { data: latest } = await supabaseAdmin
        .from('upload')
        .select('id, filename, applied_at')
        .eq('status', 'applied')
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      upload_id = latest?.id as string | null;
    }

    if (!upload_id) {
      return NextResponse.json({ upload: null, changes: [] });
    }

    const [uploadRes, changesRes] = await Promise.all([
      supabaseAdmin.from('upload').select('id, filename, applied_at, stats').eq('id', upload_id).single(),
      supabaseAdmin
        .from('tender_field_change')
        .select('id, tender_id, field_name, old_value, new_value, changed_at')
        .eq('upload_id', upload_id)
        // Sentinels ('__created', '__presence') are no longer written as of R3,
        // but legacy rows from before the migration remain in the DB. Filter
        // them out so the "What Moved" feed only shows real field diffs.
        .not('field_name', 'in', '(__created,__presence)')
        .order('changed_at', { ascending: false })
        .limit(2000),
    ]);
    if (uploadRes.error || !uploadRes.data) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });

    const tenderIds = Array.from(new Set((changesRes.data || []).map((c) => c.tender_id as string)));
    let tendersById: Record<string, { id: string; description: string; agency: string; stage: string }> = {};
    if (tenderIds.length > 0) {
      const { data: tenders } = await supabaseAdmin
        .from('tender')
        .select('id, description, agency, stage')
        .in('id', tenderIds);
      tendersById = Object.fromEntries((tenders || []).map((t) => [t.id as string, t as { id: string; description: string; agency: string; stage: string }]));
    }

    // Group changes by tender.
    const byTender: Record<string, Array<{ field: string; old: unknown; new: unknown; at: string }>> = {};
    for (const c of changesRes.data || []) {
      const tid = c.tender_id as string;
      if (!byTender[tid]) byTender[tid] = [];
      byTender[tid].push({ field: c.field_name as string, old: c.old_value, new: c.new_value, at: c.changed_at as string });
    }

    // Group tenders by agency.
    const byAgency: Record<string, Array<{ tender: typeof tendersById[string]; changes: Array<{ field: string; old: unknown; new: unknown; at: string }> }>> = {};
    for (const [tid, changes] of Object.entries(byTender)) {
      const t = tendersById[tid];
      if (!t) continue;
      // Sort: stage changes first, then others by time.
      changes.sort((a, b) => {
        const aStage = a.field === 'stage' ? 0 : 1;
        const bStage = b.field === 'stage' ? 0 : 1;
        if (aStage !== bStage) return aStage - bStage;
        return new Date(b.at).getTime() - new Date(a.at).getTime();
      });
      const agency = t.agency;
      if (!byAgency[agency]) byAgency[agency] = [];
      byAgency[agency].push({ tender: t, changes });
    }

    return NextResponse.json({ upload: uploadRes.data, groups: byAgency });
  } catch (err) {
    logger.error({ err }, 'Error fetching changes feed');
    return NextResponse.json({ error: 'Failed to load changes' }, { status: 500 });
  }
}
