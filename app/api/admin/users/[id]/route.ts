import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendInviteEmail } from '@/lib/invite-email';
import type { Role } from '@/lib/auth';

const VALID_ROLES: Role[] = ['dg', 'minister', 'ps', 'agency_admin', 'officer'];
const VALID_AGENCIES = ['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'];

async function logAudit(actorId: string, targetUserId: string, action: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const { id } = await params;

  if (session.user.id === id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });
  }

  const body = await request.json();

  // --- Dispatch to specific actions ---
  if (body.action === 'suspend') {
    const { data: user } = await supabaseAdmin.from('users').select('email, status').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({ status: 'suspended', is_active: false }).eq('id', id);
    await logAudit(session.user.id, id, 'suspended', { email: user.email });
    return NextResponse.json({ success: true, message: `User suspended` });
  }

  if (body.action === 'reactivate') {
    const { data: user } = await supabaseAdmin.from('users').select('email, status').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await supabaseAdmin.from('users').update({ status: 'active', is_active: true }).eq('id', id);
    await logAudit(session.user.id, id, 'reactivated', { email: user.email });
    return NextResponse.json({ success: true, message: `User reactivated` });
  }

  if (body.action === 'archive') {
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

  if (body.action === 'restore') {
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

  if (body.action === 'force_signout') {
    const { data: user } = await supabaseAdmin.from('users').select('email').eq('id', id).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    await logAudit(session.user.id, id, 'force_signout', { email: user.email });
    return NextResponse.json({ success: true, message: 'Sign-out signal sent. User will be signed out on next request.' });
  }

  if (body.action === 'resend_invite') {
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

  // --- Standard field updates ---
  const updates: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body.agency !== undefined) {
    if (body.agency !== null && !VALID_AGENCIES.includes(body.agency)) {
      return NextResponse.json({ error: 'Invalid agency' }, { status: 400 });
    }
    updates.agency = body.agency;
  }

  if (body.name !== undefined) {
    updates.name = body.name;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
    updates.status = body.is_active ? 'active' : 'inactive';
  }

  // Enforce constraint: ministry roles must have null agency
  const newRole = (updates.role as string) || undefined;
  if (newRole) {
    if (['dg', 'minister', 'ps'].includes(newRole)) {
      updates.agency = null;
    } else if (['agency_admin', 'officer'].includes(newRole) && !updates.agency && body.agency === undefined) {
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

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, email, name, role, agency, is_active, status')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log for field changes
  const changes: Record<string, unknown> = {};
  if (updates.role && updates.role !== beforeUser?.role) changes.role = { from: beforeUser?.role, to: updates.role };
  if (updates.agency !== undefined && updates.agency !== beforeUser?.agency) changes.agency = { from: beforeUser?.agency, to: updates.agency };
  if (updates.is_active !== undefined && updates.is_active !== beforeUser?.is_active) changes.is_active = { from: beforeUser?.is_active, to: updates.is_active };
  if (updates.name && updates.name !== beforeUser?.name) changes.name = { from: beforeUser?.name, to: updates.name };

  if (Object.keys(changes).length > 0) {
    await logAudit(session.user.id, id, 'updated', changes);
  }

  return NextResponse.json({ user: data });
}

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
