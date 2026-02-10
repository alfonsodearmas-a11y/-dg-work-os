import { NextRequest, NextResponse } from 'next/server';
import { getRecordingsList } from '@/lib/recording-db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { recordings, total } = await getRecordingsList({ status, limit, offset });

    return NextResponse.json({ recordings, total });
  } catch (err: any) {
    console.error('[recordings] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
