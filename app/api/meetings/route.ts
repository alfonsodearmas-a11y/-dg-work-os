import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const MEETING_COLUMNS = 'id, title, date, attendees, status, summary, key_decisions, transcript, created_at, updated_at';

export async function GET(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;

  // Date range: default to last 90 days
  const daysBack = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '90', 10)));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString();

  const { data, error, count } = await supabaseAdmin
    .from('meetings')
    .select(`${MEETING_COLUMNS}, meeting_actions(id, task, owner, due_date, done, confidence, skipped, task_id)`, { count: 'exact' })
    .gte('created_at', cutoffStr)
    .order('date', { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    meetings: data,
    total: count || 0,
    page,
    limit,
  });
}

const createMeetingSchema = z.object({
  title: z.string().min(1),
  attendees: z.array(z.string()).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { data, error } = await parseBody(request, createMeetingSchema);
  if (error) return error;

  const { data: meeting, error: insertError } = await supabaseAdmin
    .from('meetings')
    .insert({
      title: data!.title,
      attendees: data!.attendees || [],
    })
    .select(`${MEETING_COLUMNS}, meeting_actions(id, task, owner, due_date, done, confidence, skipped, task_id)`)
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ meeting }, { status: 201 });
});
