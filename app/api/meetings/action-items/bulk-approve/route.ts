import { NextRequest, NextResponse } from 'next/server';
import { bulkApproveItems } from '@/lib/recording-db';
import { authenticateAny } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user (optional - will work without auth)
    let userId: string | undefined;
    try {
      const user = await authenticateAny(request);
      userId = user.id;
    } catch {
      // Auth is optional - if not authenticated, userId will be undefined
    }

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const result = await bulkApproveItems(ids, userId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
