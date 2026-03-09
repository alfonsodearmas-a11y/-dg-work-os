import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';
import { sendInviteEmail } from '@/lib/invite-email';
import { withErrorHandler } from '@/lib/api-utils';
import { grantModuleAccess } from '@/lib/modules/access';

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
const VALID_AGENCIES = ['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'] as const;

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(VALID_INVITE_ROLES),
  agency: z.enum(VALID_AGENCIES).optional(),
}).refine(
  (d) => d.role !== 'agency_admin' || !!d.agency,
  { message: 'Agency is required for agency_admin role', path: ['agency'] },
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

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const { data: newUser, error: dbError } = await supabaseAdmin
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

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await sendInviteEmail({
    to: newUser.email,
    name: newUser.name,
    role: newUser.role,
    agency: newUser.agency,
    inviterName: session.user.name || 'The Director General',
  }).catch(() => {});

  // Grant explicit module access
  if (moduleGrants.length > 0) {
    await Promise.all(
      moduleGrants.map(slug => grantModuleAccess(newUser.id, slug, session.user.id))
    );
  }

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

  return NextResponse.json({ user: newUser }, { status: 201 });
});
