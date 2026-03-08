import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { data, error } = await supabaseAdmin
    .from('meetings')
    .select('*, meeting_actions(*)')
    .order('date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meetings: data });
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
    .select('*, meeting_actions(*)')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ meeting }, { status: 201 });
});
