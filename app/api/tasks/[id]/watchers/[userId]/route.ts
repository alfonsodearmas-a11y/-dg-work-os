import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { canRemoveWatcher } from '@/lib/tasks/permissions';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/tasks/[id]/watchers/[userId]
 *
 * Removes a watcher row. The watcher themselves can self-remove; DG can
 * remove any watcher. Owners/assigners use the same surface to manage their
 * task's watcher list.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id: taskId, userId } = await params;

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, assigned_by_user_id')
    .eq('id', taskId)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (!canRemoveWatcher(task, session, userId)) {
    return NextResponse.json(
      { error: 'Not authorized to remove this watcher' },
      { status: 403 },
    );
  }

  const { error, count } = await supabaseAdmin
    .from('task_watchers')
    .delete({ count: 'exact' })
    .eq('task_id', taskId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ err: error, taskId, userId }, 'task-watchers DELETE failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, removed: count ?? 0 });
}
