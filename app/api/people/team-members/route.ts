import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { checkPermission, logActivity } from '@/lib/people-permissions';
import { sendInviteEmail } from '@/lib/invite-email';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'user.read');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, avatar_url, role, agency, is_active, status, last_login, login_count, invited_at, first_login_at, last_seen_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agency-scoped: agency_admin/officer only see their own agency
  let members = data || [];
  if (['agency_admin', 'officer'].includes(session.user.role) && session.user.agency) {
    members = members.filter(
      m => m.agency === session.user.agency || ['dg', 'minister', 'ps'].includes(m.role)
    );
  }

  return NextResponse.json({ members });
}

const VALID_INVITE_ROLES = ['agency_admin', 'officer'] as const;
const VALID_AGENCIES = ['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'] as const;

const inviteSchema = z.object({
  email: z.string().email().min(1),
  name: z.string().min(1),
  role: z.enum(['agency_admin', 'officer']),
  agency: z.enum(VALID_AGENCIES).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'user.invite');
  if (!hasPermission) {
    await logActivity({
      userId: session.user.id,
      action: 'invite_user',
      result: 'denied',
      denialReason: 'Missing user.invite permission',
    });
    return NextResponse.json({ error: 'You do not have permission to invite users' }, { status: 403 });
  }

  const { data, error } = await parseBody(request, inviteSchema);
  if (error) return error;

  if (data!.role === 'agency_admin' && !data!.agency) {
    return NextResponse.json({ error: 'Agency is required for agency_admin role' }, { status: 400 });
  }

  if (session.user.role === 'agency_admin') {
    if (data!.agency && data!.agency !== session.user.agency) {
      return NextResponse.json({ error: 'You can only invite users to your own agency' }, { status: 403 });
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', data!.email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const { data: newUser, error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      email: data!.email.toLowerCase().trim(),
      name: data!.name.trim(),
      role: data!.role,
      agency: data!.agency || null,
      is_active: false,
      status: 'pending',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    })
    .select('id, email, name, role, agency, status')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await sendInviteEmail({
    to: newUser.email,
    name: newUser.name,
    role: newUser.role,
    agency: newUser.agency,
    inviterName: session.user.name || 'The Director General',
  }).catch(() => {});

  await logActivity({
    userId: session.user.id,
    action: 'invite_user',
    objectType: 'user',
    objectId: newUser.id,
    objectName: newUser.name,
    changes: { email: newUser.email, role: newUser.role, agency: newUser.agency },
    result: 'success',
  });

  return NextResponse.json({ member: newUser }, { status: 201 });
});
