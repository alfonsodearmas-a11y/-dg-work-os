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

  const { data, error } = await supabaseAdmin
    .from('task_comments')
    .select('*, user:users!user_id(name, role)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const comments = (data || []).map((c) => {
    const user = c.user as { name: string; role: string } | null;
    return {
      ...c,
      user_name: user?.name || 'Unknown',
      user_role: user?.role || '',
      user: undefined,
    };
  });

  return NextResponse.json({ success: true, data: comments });
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

  const { data: comment, error } = await supabaseAdmin
    .from('task_comments')
    .insert({
      task_id: id,
      user_id: session.user.id,
      body: data.body,
      parent_id: data.parent_id || null,
    })
    .select('*, user:users!user_id(name, role)')
    .single();

  if (error) {
    console.error('[task-comments] Insert error:', error.message);
    return apiError('DB_ERROR', error.message, 500);
  }

  // Log activity
  await supabaseAdmin.from('task_activity').insert({
    task_id: id,
    user_id: session.user.id,
    action: 'commented',
    new_value: data.body.substring(0, 200),
  });

  const user = comment.user as { name: string; role: string } | null;
  const flatComment = {
    ...comment,
    user_name: user?.name || session.user.name || 'Unknown',
    user_role: user?.role || session.user.role || '',
    user: undefined,
  };

  return NextResponse.json({ success: true, data: flatComment }, { status: 201 });
});
