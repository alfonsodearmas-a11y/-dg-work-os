import { NextRequest, NextResponse } from 'next/server';
import { approveDraftItem } from '@/lib/recording-db';
import { authenticateAny } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Get authenticated user (optional - will work without auth)
    let userId: string | undefined;
    try {
      const user = await authenticateAny(request);
      userId = user.id;
    } catch {
      // Auth is optional - if not authenticated, userId will be undefined
    }

    const { id } = await params;
    const item = await approveDraftItem(id, userId);
    return NextResponse.json({ action_item: item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
