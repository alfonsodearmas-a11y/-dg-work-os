import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendInviteEmail } from '@/lib/invite-email';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

async function logAudit(actorId: string, targetUserId: string, action: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
}

const patchUserSchema = z.object({
  action: z.enum(['suspend', 'reactivate', 'archive', 'restore', 'force_signout', 'resend_invite']).optional(),
  role: z.enum(['dg', 'minister', 'ps', 'agency_admin', 'officer'] as const).optional(),
  agency: z.enum(['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'] as const).nullable().optional(),
  name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  if (session.user.id === id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });
  }

  const { data, error } = await parseBody(request, patchUserSchema);
  if (error) return error;

  if (data!.action === 'suspend') {
    const { data: user } = await supabaseAdmin.from('users').select('email, status').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({ status: 'suspended', is_active: false }).eq('id', id);
    await logAudit(session.user.id, id, 'suspended', { email: user.email });
    return NextResponse.json({ success: true, message: `User suspended` });
  }

  if (data!.action === 'reactivate') {
    const { data: user } = await supabaseAdmin.from('users').select('email, status').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({ status: 'active', is_active: true }).eq('id', id);
    await logAudit(session.user.id, id, 'reactivated', { email: user.email });
    return NextResponse.json({ success: true, message: `User reactivated` });
  }

  if (data!.action === 'archive') {
    const { data: user } = await supabaseAdmin.from('users').select('email').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({
      status: 'archived',
      is_active: false,
      archived_at: new Date().toISOString(),
    }).eq('id', id);
    await logAudit(session.user.id, id, 'archived', { email: user.email });
    return NextResponse.json({ success: true, message: 'User archived' });
  }

  if (data!.action === 'restore') {
    const { data: user } = await supabaseAdmin.from('users').select('email').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({
      status: 'active',
      is_active: true,
      archived_at: null,
    }).eq('id', id);
    await logAudit(session.user.id, id, 'restored', { email: user.email });
    return NextResponse.json({ success: true, message: 'User restored' });
  }

  if (data!.action === 'force_signout') {
    const { data: user } = await supabaseAdmin.from('users').select('email').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    await logAudit(session.user.id, id, 'force_signout', { email: user.email });
    return NextResponse.json({ success: true, message: 'Sign-out signal sent. User will be signed out on next request.' });
  }

  if (data!.action === 'resend_invite') {
    const { data: user } = await supabaseAdmin.from('users').select('email, name, status, role, agency').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.status !== 'pending') {
      return NextResponse.json({ error: 'User has already signed in' }, { status: 400 });
    }

    const emailResult = await sendInviteEmail({
      to: user.email,
      name: user.name || user.email,
      role: user.role,
      agency: user.agency,
      inviterName: session.user.name || 'The Director General',
    });

    if (!emailResult.success) {
      return NextResponse.json({ error: emailResult.error || 'Failed to send email' }, { status: 500 });
    }

    await supabaseAdmin.from('users').update({ invited_at: new Date().toISOString() }).eq('id', id);
    await logAudit(session.user.id, id, 'resend_invite', { email: user.email });
    return NextResponse.json({ success: true, message: `Invite email resent to ${user.email}` });
  }

  const updates: Record<string, unknown> = {};

  if (data!.role !== undefined) {
    updates.role = data!.role;
  }

  if (data!.agency !== undefined) {
    updates.agency = data!.agency;
  }

  if (data!.name !== undefined) {
    updates.name = data!.name;
  }

  if (data!.is_active !== undefined) {
    updates.is_active = data!.is_active;
    updates.status = data!.is_active ? 'active' : 'inactive';
  }

  const newRole = (updates.role as string) || undefined;
  if (newRole) {
    if (['dg', 'minister', 'ps'].includes(newRole)) {
      updates.agency = null;
    } else if (['agency_admin', 'officer'].includes(newRole) && !updates.agency && data!.agency === undefined) {
      const { data: existing } = await supabaseAdmin.from('users').select('agency').eq('id', id).single();
      if (!existing?.agency) {
        return NextResponse.json({ error: 'Agency is required for agency_admin and officer roles' }, { status: 400 });
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: beforeUser } = await supabaseAdmin.from('users').select('role, agency, is_active, status, name').eq('id', id).single();

  const { data: updatedUser, error: dbError } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, email, name, role, agency, is_active, status')
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const changes: Record<string, unknown> = {};
  if (updates.role && updates.role !== beforeUser?.role) changes.role = { from: beforeUser?.role, to: updates.role };
  if (updates.agency !== undefined && updates.agency !== beforeUser?.agency) changes.agency = { from: beforeUser?.agency, to: updates.agency };
  if (updates.is_active !== undefined && updates.is_active !== beforeUser?.is_active) changes.is_active = { from: beforeUser?.is_active, to: updates.is_active };
  if (updates.name && updates.name !== beforeUser?.name) changes.name = { from: beforeUser?.name, to: updates.name };

  if (Object.keys(changes).length > 0) {
    await logAudit(session.user.id, id, 'updated', changes);
  }

  return NextResponse.json({ user: updatedUser });
});

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const { id } = await params;

  if (session.user.id === id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  // Require email confirmation for hard delete
  const { data: user } = await supabaseAdmin.from('users').select('email, name').eq('id', id).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (body.confirmEmail !== user.email) {
    return NextResponse.json({ error: 'Email confirmation does not match' }, { status: 400 });
  }

  await logAudit(session.user.id, id, 'deleted_permanently', { email: user.email, name: user.name });

  const { error } = await supabaseAdmin.from('users').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'User permanently deleted' });
}
