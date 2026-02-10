import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError } from '@/lib/auth';
import { markNotificationRead } from '@/lib/task-notifications';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authenticateAny(request);
    const { id } = await params;
    await markNotificationRead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
