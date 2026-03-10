import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { notifyMentionedUsers } from '@/lib/mention-notifications';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { commentId, taskId, mentionedUserIds } = await request.json();

    if (!commentId || !taskId || !Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    await notifyMentionedUsers(commentId, taskId, mentionedUserIds, authResult.session.user.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[mention-notify] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
