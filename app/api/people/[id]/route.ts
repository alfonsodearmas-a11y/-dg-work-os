import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { checkPermission, logActivity, canManageUser } from '@/lib/people-permissions';
import type { Role } from '@/lib/people-types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'user.manage_roles');
  if (!hasPermission) {
    await logActivity({
      userId: session.user.id,
      action: 'update_user',
      objectType: 'user',
      objectId: id,
      result: 'denied',
      denialReason: 'Missing user.manage_roles permission',
    });
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const { role, agency, name } = body;

  // Get the target user
  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('id, name, role, agency')
    .eq('id', id)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Prevent managing users at same or higher level
  if (!canManageUser(session.user.role as Role, targetUser.role as Role)) {
    await logActivity({
      userId: session.user.id,
      action: 'update_user',
      objectType: 'user',
      objectId: id,
      objectName: targetUser.name,
      result: 'denied',
      denialReason: 'Cannot manage user at same or higher hierarchy level',
    });
    return NextResponse.json({ error: 'Cannot manage this user — insufficient hierarchy level' }, { status: 403 });
  }

  // If changing role, check new role is below actor
  if (role && !canManageUser(session.user.role as Role, role as Role)) {
    return NextResponse.json({ error: 'Cannot assign a role at or above your level' }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: Record<string, unknown> = {};

  if (role && role !== targetUser.role) {
    updates.role = role;
    changes.role = { from: targetUser.role, to: role };
  }
  if (agency !== undefined && agency !== targetUser.agency) {
    updates.agency = agency || null;
    changes.agency = { from: targetUser.agency, to: agency || null };
  }
  if (name && name !== targetUser.name) {
    updates.name = name;
    changes.name = { from: targetUser.name, to: name };
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ message: 'No changes' });
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity({
    userId: session.user.id,
    action: 'update_user',
    objectType: 'user',
    objectId: id,
    objectName: targetUser.name,
    changes,
    result: 'success',
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const hasPermission = await checkPermission(session.user.id, 'user.delete');
  if (!hasPermission) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Prevent self-deletion
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role')
    .eq('id', id)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!canManageUser(session.user.role as Role, targetUser.role as Role)) {
    return NextResponse.json({ error: 'Cannot delete user at same or higher hierarchy level' }, { status: 403 });
  }

  // Require email confirmation
  const body = await request.json().catch(() => ({}));
  if (body.confirmEmail !== targetUser.email) {
    return NextResponse.json({ error: 'Email confirmation required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity({
    userId: session.user.id,
    action: 'delete_user',
    objectType: 'user',
    objectId: id,
    objectName: targetUser.name,
    changes: { email: targetUser.email, role: targetUser.role },
    result: 'success',
  });

  return NextResponse.json({ success: true });
}
