import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/document-search';
import { requireRole } from '@/lib/auth-helpers';
import { getAgencyScope } from '@/lib/scoped-query';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || undefined;
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;

    // Agency scoping: non-ministry users are locked to their agency
    const scope = getAgencyScope(session);
    const agency = scope || searchParams.get('agency') || undefined;

    const results = await searchDocuments(query, {
      agency,
      document_type: type,
      date_from: dateFrom,
      date_to: dateTo
    });

    return NextResponse.json(results);
  } catch (error) {
    logger.error({ err: error }, 'Document search failed');
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
