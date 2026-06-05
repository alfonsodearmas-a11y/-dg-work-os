import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { canManageWatchers } from '@/lib/tasks/permissions';
import { logger } from '@/lib/logger';

/**
 * GET  /api/tasks/[id]/watchers — list current watchers for the UI.
 * POST /api/tasks/[id]/watchers — add one or more watchers.
 *
 * Self-removal goes through DELETE /api/tasks/[id]/watchers/[userId].
 * Bulk operations during task create/update flow through the existing
 * POST/PATCH /api/tasks routes (watchers / addWatchers / removeWatchers).
 */

interface JoinedWatcherRow {
  user_id: string;
  added_at: string;
  added_by_user_id: string | null;
  user: { id: string; name: string | null; email: string; agency: string | null } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id: taskId } = await params;

  const { data, error } = await supabaseAdmin
    .from('task_watchers')
    .select(
      'user_id, added_at, added_by_user_id, user:users!user_id(id, name, email, agency)',
    )
    .eq('task_id', taskId);

  if (error) {
    logger.error({ err: error, taskId }, '[task-watchers GET] query failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as unknown) as JoinedWatcherRow[];
  const watchers = rows
    .map((row) => {
      // Supabase returns `user` as an array for some FK shapes, but the
      // `users!user_id` join targets a single FK row.
      const u = Array.isArray(row.user) ? row.user[0] ?? null : row.user;
      if (!u) return null;
      return {
        user_id: row.user_id,
        name: u.name,
        email: u.email,
        agency: u.agency,
        added_at: row.added_at,
        added_by_user_id: row.added_by_user_id,
      };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  return NextResponse.json({ watchers });
}

const postSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id: taskId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Self-add for non-owners is intentionally unsupported — it would create
  // implicit subscriptions outside the spec.
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, assigned_by_user_id')
    .eq('id', taskId)
    .single();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!canManageWatchers(task, session)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const rows = parsed.data.user_ids
    .filter((uid) => uid && uid !== task.owner_user_id)
    .map((uid) => ({
      task_id: taskId,
      user_id: uid,
      added_by_user_id: session.user.id,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ added: 0 });
  }

  const { error: addErr, count } = await supabaseAdmin
    .from('task_watchers')
    .upsert(rows, { onConflict: 'task_id,user_id', ignoreDuplicates: true, count: 'exact' });

  if (addErr) {
    logger.error({ err: addErr, taskId }, '[task-watchers POST] upsert failed');
    return NextResponse.json({ error: addErr.message }, { status: 500 });
  }

  return NextResponse.json({ added: count ?? rows.length });
}
