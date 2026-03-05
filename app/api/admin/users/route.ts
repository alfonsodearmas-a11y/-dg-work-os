import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, avatar_url, role, agency, is_active, status, last_login, login_count, invited_at, first_login_at, last_seen_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

const VALID_INVITE_ROLES = ['agency_admin', 'officer'] as const;
const VALID_AGENCIES = ['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'];

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const body = await request.json();
  const { email, name, role, agency } = body;

  if (!email || !name || !role) {
    return NextResponse.json({ error: 'Email, name, and role are required' }, { status: 400 });
  }

  if (!VALID_INVITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Can only invite agency_admin or officer.' }, { status: 400 });
  }

  if (role === 'agency_admin' && (!agency || !VALID_AGENCIES.includes(agency))) {
    return NextResponse.json({ error: 'Agency is required for agency_admin role' }, { status: 400 });
  }

  if (agency && !VALID_AGENCIES.includes(agency)) {
    return NextResponse.json({ error: 'Invalid agency' }, { status: 400 });
  }

  // Check if email already exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role,
      agency: agency || null,
      is_active: false,
      status: 'pending',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    })
    .select('id, email, name, role, agency, status')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: newUser }, { status: 201 });
}
