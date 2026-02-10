import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { revokeUserTokens } from '@/lib/invite-tokens';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const body = await request.json();
    const { status, role, agency } = body;

    const currentResult = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const currentUser = currentResult.rows[0];

    // Cannot modify own status
    if (status && user.id === id) {
      return NextResponse.json({ success: false, error: 'Cannot change your own account status' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      values.push(status);
      // Sync is_active with status
      updates.push(`is_active = $${paramIdx++}`);
      values.push(status !== 'disabled');
    }
    if (role !== undefined) { updates.push(`role = $${paramIdx++}`); values.push(role); }
    if (agency !== undefined) { updates.push(`agency = $${paramIdx++}`); values.push(agency); }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, username, email, full_name, role, agency, is_active, status`,
      values
    );

    // When disabling: revoke all tokens, kill sessions
    if (status === 'disabled') {
      await revokeUserTokens(id);
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    }

    await auditService.log({
      userId: user.id,
      action: 'UPDATE_USER',
      entityType: 'users',
      entityId: id,
      oldValues: { status: currentUser.status, role: currentUser.role, agency: currentUser.agency },
      newValues: body,
      request,
    });

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director');

    if (user.id === id) {
      return NextResponse.json({ success: false, error: 'Cannot delete your own account' }, { status: 400 });
    }

    const target = await query('SELECT id, full_name FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Clean up related data
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    await query('DELETE FROM task_notifications WHERE user_id = $1', [id]);
    // invite_tokens cascades via FK

    await query('DELETE FROM users WHERE id = $1', [id]);

    await auditService.log({
      userId: user.id,
      action: 'DELETE_USER',
      entityType: 'users',
      entityId: id,
      oldValues: { full_name: target.rows[0].full_name },
      newValues: { deleted: true },
      request,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
