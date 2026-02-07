import { NextRequest, NextResponse } from 'next/server';
import { assembleSystemContext } from '@/lib/ai/context-engine';

export async function GET(request: NextRequest) {
  try {
    const page = request.nextUrl.searchParams.get('page') || '/';
    const context = await assembleSystemContext(page);

    return new NextResponse(context, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('[ai/context] Error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to assemble context' },
      { status: 500 }
    );
  }
}
