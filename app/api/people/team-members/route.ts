import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { checkPermission, logActivity } from '@/lib/people-permissions';
import { sendInviteEmail } from '@/lib/invite-email';
import { parseBody, withErrorHandler } from '@/lib/api-utils';
import { normalizeRole } from '@/lib/auth-session';

export async function GET() {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
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

  // Agency-scoped: agency managers only see their own agency
  let members = (data || []).map((m) => ({ ...m, role: normalizeRole(m.role) ?? m.role }));
  if (session.user.role === 'agency_manager' && session.user.agency) {
    members = members.filter(
      m => m.agency === session.user.agency || m.role === 'superadmin'
    );
  }

  return NextResponse.json({ members });
}

const VALID_AGENCIES = ['GPL', 'CJIA', 'GWI', 'GCAA', 'HECI', 'MARAD', 'HAS'] as const;

const inviteSchema = z.object({
  email: z.string().email().min(1),
  name: z.string().min(1),
  role: z.enum(['superadmin', 'agency_manager']),
  agency: z.enum(VALID_AGENCIES).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
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

  if (data!.role === 'agency_manager' && !data!.agency) {
    return NextResponse.json({ error: 'Agency is required for the agency manager role' }, { status: 400 });
  }

  if (session.user.role === 'agency_manager') {
    if (data!.agency && data!.agency !== session.user.agency) {
      return NextResponse.json({ error: 'You can only invite users to your own agency' }, { status: 403 });
    }
  }

  const normalizedEmail = data!.email.toLowerCase().trim();

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Auth user first — users_id_authusers_fkey requires the same uuid in auth.users.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  });
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Failed to create auth account' }, { status: 500 });
  }

  const { data: newUser, error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      email: normalizedEmail,
      name: data!.name.trim(),
      role: data!.role,
      agency: data!.role === 'superadmin' ? null : (data!.agency || null),
      is_active: false,
      status: 'pending',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    })
    .select('id, email, name, role, agency, status')
    .single();

  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await sendInviteEmail({
    to: newUser.email,
    name: newUser.name,
    role: newUser.role,
    agency: newUser.agency,
    inviterName: session.user.name || 'The Director General',
    inviteToken: null,
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
