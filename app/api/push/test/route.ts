import { NextRequest, NextResponse } from 'next/server';
import { sendTestPush } from '@/lib/push';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.user_id || 'dg';
    const result = await sendTestPush(userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/push/test error:', err);
    return NextResponse.json({ error: 'Failed to send test push' }, { status: 500 });
  }
}
