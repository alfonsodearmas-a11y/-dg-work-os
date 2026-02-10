import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError, authorizeRoles } from '@/lib/auth';
import { decideExtension } from '@/lib/task-queries';
import { createTaskNotification } from '@/lib/task-notifications';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; extId: string }> }) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');
    const { id, extId } = await params;

    const { approved, note } = await request.json();
    if (typeof approved !== 'boolean') return NextResponse.json({ success: false, error: 'approved (boolean) is required' }, { status: 400 });

    const result = await decideExtension(extId, user.id, approved, note);

    // Notify requester
    await createTaskNotification(
      result.requested_by,
      'extension_decided',
      id,
      `Extension ${approved ? 'approved' : 'rejected'}`,
      note || (approved ? 'Your deadline extension has been approved' : 'Your deadline extension was rejected')
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
