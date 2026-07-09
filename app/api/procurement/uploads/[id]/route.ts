import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  try {
    const [uploadRes, reviewRes, changesRes] = await Promise.all([
      supabaseAdmin
        .from('upload')
        .select('id, filename, uploaded_at, uploaded_by, status, stats, applied_at, cancelled_at, uploader:users!upload_uploaded_by_fkey(name)')
        .eq('id', id)
        .single(),
      supabaseAdmin
        .from('tender_match_review')
        .select('id, incoming_row, candidate_tender_ids, scores, status, resolution_tender_id, resolved_at, resolved_by, created_at')
        .eq('upload_id', id)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('tender_field_change')
        .select('id, tender_id, field_name, old_value, new_value, changed_at')
        .eq('upload_id', id)
        .order('changed_at', { ascending: false })
        .limit(500),
    ]);
    if (uploadRes.error || !uploadRes.data) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });

    return NextResponse.json({
      upload: uploadRes.data,
      review: reviewRes.data || [],
      changes: changesRes.data || [],
    });
  } catch (err) {
    logger.error({ err, id }, 'Error fetching upload');
    return NextResponse.json({ error: 'Failed to load upload' }, { status: 500 });
  }
}
