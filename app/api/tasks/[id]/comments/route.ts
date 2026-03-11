import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const COMMENT_COLUMNS = 'id, task_id, user_id, body, parent_id, created_at';

const createCommentSchema = z.object({
  body: z.string().min(1),
  parent_id: z.string().uuid().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Use a Supabase JOIN to fetch comments with user info in a single query (no N+1)
  const { data: comments, error } = await supabaseAdmin
    .from('task_comments')
    .select(`${COMMENT_COLUMNS}, users:user_id(name, role)`)
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ err: error }, '[task-comments] GET error');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const enriched = (comments || []).map((c) => {
    const usersRaw = c.users as unknown;
    const user = (Array.isArray(usersRaw) ? usersRaw[0] : usersRaw) as { name: string; role: string } | null;
    return {
      id: c.id,
      task_id: c.task_id,
      user_id: c.user_id,
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      user_name: user?.name || 'Unknown',
      user_role: user?.role || '',
    };
  });

  return NextResponse.json({ success: true, data: enriched });
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  const { data, error: validationError } = await parseBody(request, createCommentSchema);
  if (validationError) return validationError;

  logger.info({ task_id: id, user_id: session.user.id, bodyLen: data.body.length }, '[task-comments] INSERT attempt');

  const { data: comment, error } = await supabaseAdmin
    .from('task_comments')
    .insert({
      task_id: id,
      user_id: session.user.id,
      body: data.body,
      parent_id: data.parent_id || null,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (error) {
    logger.error({ err: error }, '[task-comments] INSERT error');
    return apiError('DB_ERROR', error.message, 500);
  }

  logger.info({ commentId: comment.id }, '[task-comments] INSERT OK');

  // Log activity (fire-and-forget)
  Promise.resolve(
    supabaseAdmin.from('task_activity').insert({
      task_id: id,
      user_id: session.user.id,
      action: 'commented',
      new_value: data.body.substring(0, 200),
    }).then(({ error: actErr }) => {
      if (actErr) logger.warn({ err: actErr }, '[task-comments] Activity log failed');
    })
  ).catch((err: unknown) => logger.error({ err }, 'Failed to create notification'));

  const flatComment = {
    ...comment,
    user_name: session.user.name || 'Unknown',
    user_role: session.user.role || '',
  };

  return NextResponse.json({ success: true, data: flatComment }, { status: 201 });
});
