import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';
import { NotificationDeliveryError } from '@/lib/notifications/errors';
import { sendInviteEmail } from '@/lib/invite-email';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';
import { normalizeRole } from '@/lib/auth-session';
import { USER_AGENCIES } from '@/lib/constants/agencies';

export async function GET() {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, avatar_url, role, formal_title, agency, is_owner, is_active, status, last_login, login_count, invited_at, first_login_at, last_seen_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Last-active truth lives in auth.users.last_sign_in_at (GoTrue writes it on
  // every sign-in); public.users.status/last_login can lag — invitees stayed
  // 'pending' forever before the first-login promotion existed. Derive the
  // effective values server-side so anyone who has actually signed in never
  // displays as "Pending / Never signed in". Non-fatal: on listUsers failure
  // the directory falls back to profile fields alone.
  let lastSignInById = new Map<string, string>();
  try {
    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authErr) throw authErr;
    lastSignInById = new Map(
      (authList?.users || [])
        .filter((au) => au.last_sign_in_at)
        .map((au) => [au.id, au.last_sign_in_at as string]),
    );
  } catch (err) {
    logger.warn({ err }, '[admin-users] auth.admin.listUsers failed — serving profile-only directory');
  }

  // The 'system' row keeps its raw value in the list (display-only there);
  // human rows already store two-level values (migration 128).
  const users = (data || []).map((u) => {
    const lastSignIn = lastSignInById.get(u.id) ?? null;
    const candidates = [u.last_login, lastSignIn].filter(Boolean) as string[];
    const lastLogin = candidates.length
      ? candidates.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b))
      : null;
    const hasSignedIn = candidates.length > 0;
    return {
      ...u,
      role: normalizeRole(u.role) ?? u.role,
      last_login: lastLogin,
      status: u.status === 'pending' && hasSignedIn ? 'active' : u.status,
      is_active: u.is_active || (u.status === 'pending' && hasSignedIn),
    };
  });

  return NextResponse.json({ users });
}

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['superadmin', 'agency_manager'] as const),
  agency: z.enum(USER_AGENCIES).nullable().optional(),
  formal_title: z.string().min(1).optional(),
}).refine(
  (d) => d.role !== 'agency_manager' || !!d.agency,
  { message: 'Agency is required for the Agency Manager role', path: ['agency'] },
);

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }

  const { email, name, role, agency } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // D4 (role-simplification plan): only the system OWNER can create superadmin
  // accounts — not every superadmin.
  if (role === 'superadmin') {
    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('is_owner')
      .eq('id', session.user.id)
      .single();
    if (!actor?.is_owner) {
      return NextResponse.json({ error: 'Only the system owner can create superadmin accounts' }, { status: 403 });
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', normalizedEmail)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Title is the human-facing salutation (greeting header), never a permission
  // word — so DON'T default it to the role label. Null until the owner sets one;
  // the greeting falls back to the person's name.
  const formalTitle: string | null = parsed.data.formal_title?.trim() || null;

  // Generate secure invite token for self-service password setup (7-day expiry)
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Supabase Auth owns identity: create the auth.users record FIRST and reuse
  // its id for the profile row — users_id_authusers_fkey requires it, and
  // set-password/login resolve credentials against auth.users (post-cutover).
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  });

  if (authError || !authData?.user) {
    logger.error({ err: authError }, '[admin-users] auth.admin.createUser failed');
    const isConflict = authError?.code === 'email_exists';
    return NextResponse.json(
      { error: isConflict ? 'An auth account with this email already exists' : 'Failed to create auth account' },
      { status: isConflict ? 409 : 500 },
    );
  }

  const { data: newUser, error: dbError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      email: normalizedEmail,
      name: name.trim(),
      role,
      formal_title: formalTitle,
      agency: role === 'superadmin' ? null : (agency || null),
      is_active: false,
      status: 'pending',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
      invite_token: inviteToken,
      invite_token_expires_at: tokenExpiry,
    })
    .select('id, email, name, role, formal_title, agency, status')
    .single();

  if (dbError) {
    // Roll back the auth user so a failed invite doesn't orphan an
    // auth.users record (which would 409 every retry of this email).
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch((err) => {
      logger.error({ err }, '[admin-users] failed to roll back orphaned auth user');
    });
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const emailResult = await sendInviteEmail({
    to: newUser.email,
    name: newUser.name,
    role: newUser.role,
    agency: newUser.agency,
    inviterName: session.user.name || 'The Director General',
    inviteToken,
  }).catch(() => ({ success: false, error: 'Email send failed' }));

  // Module access is pure role-based (lib/modules/role-modules.ts) — nothing to grant at invite time.

  try {
    await insertNotification({
      user_id: session.user.id,
      type: 'invite_sent',
      title: 'Invite sent',
      body: `Invite sent to ${newUser.name} (${newUser.email})`,
      icon: 'user',
      priority: 'low',
      reference_type: 'system',
      reference_id: newUser.id,
      reference_url: '/admin/people',
      scheduled_for: new Date().toISOString(),
      category: 'system',
      source_module: 'admin',
    });
  } catch (err) {
    if (err instanceof NotificationDeliveryError) {
      logger.error(err.toLogContext(), '[admin-users] notification delivery failed');
    } else {
      logger.error({ err }, '[admin-users] notification delivery failed (unexpected error type)');
    }
    // Invite was created — don't fail the user-create flow because the
    // confirmation notification couldn't be delivered.
  }

  const responseUser = { ...newUser, role: normalizeRole(newUser.role) ?? newUser.role };

  return NextResponse.json({
    user: responseUser,
    ...(!emailResult.success && { warning: 'User created but invite email failed to send' }),
  }, { status: 201 });
});
