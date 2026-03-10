import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

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

  const { data: comments, error } = await supabaseAdmin
    .from('task_comments')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[task-comments] GET error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Batch-fetch user names for all comment authors
  const userIds = [...new Set((comments || []).map((c) => c.user_id))];
  const userMap = new Map<string, { name: string; role: string }>();

  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, role')
      .in('id', userIds);

    for (const u of users || []) {
      userMap.set(u.id, { name: u.name, role: u.role });
    }
  }

  const enriched = (comments || []).map((c) => {
    const user = userMap.get(c.user_id);
    return {
      ...c,
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

  console.log('[task-comments] INSERT attempt:', { task_id: id, user_id: session.user.id, bodyLen: data.body.length });

  const { data: comment, error } = await supabaseAdmin
    .from('task_comments')
    .insert({
      task_id: id,
      user_id: session.user.id,
      body: data.body,
      parent_id: data.parent_id || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[task-comments] INSERT error:', JSON.stringify(error));
    return apiError('DB_ERROR', error.message, 500);
  }

  console.log('[task-comments] INSERT OK:', comment.id);

  // Log activity (fire-and-forget)
  supabaseAdmin.from('task_activity').insert({
    task_id: id,
    user_id: session.user.id,
    action: 'commented',
    new_value: data.body.substring(0, 200),
  }).then(({ error: actErr }) => {
    if (actErr) console.warn('[task-comments] Activity log failed:', actErr.message);
  });

  const flatComment = {
    ...comment,
    user_name: session.user.name || 'Unknown',
    user_role: session.user.role || '',
  };

  return NextResponse.json({ success: true, data: flatComment }, { status: 201 });
});
