import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { getViewAsAgencyScope } from '@/lib/scoped-query';
import { logger } from '@/lib/logger';
import { sanitizeSearchInput } from '@/lib/parse-utils';

const DOC_LIST_COLUMNS = 'id, filename, original_filename, title, summary, document_type, agency, tags, file_size, mime_type, processing_status, uploaded_at, created_at';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const { searchParams } = new URL(request.url);
    const agency = searchParams.get('agency');
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('documents')
      .select(DOC_LIST_COLUMNS)
      .in('processing_status', ['completed', 'processing', 'failed']);

    // Agency scoping: non-ministry users see only their agency's docs + untagged
    const viewAsRole = session.user.role === 'dg' ? searchParams.get('viewAsRole') : null;
    const viewAsAgency = session.user.role === 'dg' ? searchParams.get('viewAsAgency') : null;
    const scope = getViewAsAgencyScope(session, viewAsRole, viewAsAgency);
    if (scope) {
      query = query.or(`agency.ilike.${scope},agency.is.null`);
    } else if (agency) {
      // Ministry users can optionally filter by agency
      query = query.eq('agency', agency);
    }

    if (type) {
      query = query.eq('document_type', type);
    }
    if (search) {
      const sanitized = sanitizeSearchInput(search);
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
