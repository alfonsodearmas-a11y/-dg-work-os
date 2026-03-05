import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const body = await request.json();

  if (!body.task) {
    return NextResponse.json({ error: 'Task is required' }, { status: 400 });
  }

  const { data: action, error } = await supabaseAdmin
    .from('meeting_actions')
    .insert({
      meeting_id: id,
      task: body.task,
      owner: body.owner || null,
      due_date: body.due_date || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action }, { status: 201 });
}
