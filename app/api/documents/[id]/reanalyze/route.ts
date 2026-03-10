import { NextRequest, NextResponse } from 'next/server';
import { reanalyzeDocument } from '@/lib/document-analyzer';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    const analysis = await reanalyzeDocument(id);
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    logger.error({ err: error, documentId: id }, 'Re-analysis failed');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Re-analysis failed' },
      { status: 500 }
    );
  }
}
