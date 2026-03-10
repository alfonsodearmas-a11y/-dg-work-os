import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const agency = searchParams.get('agency');
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('documents')
      .select('*')
      .in('processing_status', ['completed', 'processing', 'failed']);

    if (agency) {
      query = query.eq('agency', agency);
    }
    if (type) {
      query = query.eq('document_type', type);
    }
    if (search) {
      const sanitized = search.replace(/[%_.*(),"\\]/g, '');
      if (sanitized) {
        query = query.or(`title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%`);
      }
    }

    const { data, error } = await query
      .order('uploaded_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    logger.error({ err: error }, 'Failed to list documents');
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
