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
import { grantModuleAccess, bulkUpsertModulePermissions } from '@/lib/modules/access';
import { ROLE_LABELS, MINISTRY_ROLES } from '@/lib/people-types';
import type { Role } from '@/lib/people-types';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, avatar_url, role, formal_title, agency, is_active, status, last_login, login_count, invited_at, first_login_at, last_seen_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

const ALL_INVITE_ROLES = ['dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer'] as const;
const VALID_AGENCIES = ['GPL', 'CJIA', 'GWI', 'GCAA', 'HECI', 'MARAD', 'HAS'] as const;

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ALL_INVITE_ROLES),
  agency: z.enum(VALID_AGENCIES).nullable().optional(),
}).refine(
  (d) => d.role !== 'agency_admin' || !!d.agency,
  { message: 'Agency is required for Agency Manager role', path: ['agency'] },
);

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }

  const { email, name, role, agency } = parsed.data;
  const moduleGrants: string[] = Array.isArray(body.moduleGrants) ? body.moduleGrants : [];

  // Only DG (super admin) can invite senior roles (minister, ps, dg)
  if (MINISTRY_ROLES.includes(role) && session.user.role !== 'dg') {
    return NextResponse.json({ error: 'Only the Director General can invite senior roles' }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Derive formal_title from role, or use custom title if provided
  const formalTitle: string = body.formal_title?.trim() || ROLE_LABELS[role as Role] || role;

  // Generate secure invite token for self-service password setup (7-day expiry)
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: newUser, error: dbError } = await supabaseAdmin
    .from('users')
    .insert({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role,
      formal_title: formalTitle,
      agency: MINISTRY_ROLES.includes(role) ? null : (agency || null),
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

  // Grant explicit module access (prefer granular modulePermissions, fall back to moduleGrants)
  const modulePermissions: Array<{ moduleSlug: string; canEdit: boolean }> = Array.isArray(body.modulePermissions) ? body.modulePermissions : [];
  if (modulePermissions.length > 0) {
    await bulkUpsertModulePermissions(
      newUser.id,
      modulePermissions.map(p => ({ moduleSlug: p.moduleSlug, accessType: 'grant' as const, canEdit: p.canEdit ?? false })),
      session.user.id,
    );
  } else if (moduleGrants.length > 0) {
    await Promise.all(
      moduleGrants.map(slug => grantModuleAccess(newUser.id, slug, session.user.id))
    );
  }

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

  return NextResponse.json({
    user: newUser,
    ...(!emailResult.success && { warning: 'User created but invite email failed to send' }),
  }, { status: 201 });
});
