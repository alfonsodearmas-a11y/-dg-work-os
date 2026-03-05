import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

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

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const body = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data: meeting, error } = await supabaseAdmin
    .from('meetings')
    .insert({
      title: body.title,
      attendees: body.attendees || [],
    })
    .select('*, meeting_actions(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meeting }, { status: 201 });
}
