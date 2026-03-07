import { NextRequest, NextResponse } from 'next/server';
import { assembleSystemContext } from '@/lib/ai/context-engine';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const page = request.nextUrl.searchParams.get('page') || '/';
    const context = await assembleSystemContext(page);

    return new NextResponse(context, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('[ai/context] Error:', err.message);
    return NextResponse.json(
      { error: 'Failed to assemble context' },
      { status: 500 }
    );
  }
}
