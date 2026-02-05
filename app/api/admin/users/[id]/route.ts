import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { emailService } from '@/lib/email';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const body = await request.json();
    const { is_active, role, agency } = body;

    // Get current user data for audit
    const currentResult = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const currentUser = currentResult.rows[0];
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (is_active !== undefined) { updates.push(`is_active = $${paramIdx++}`); values.push(is_active); }
    if (role !== undefined) { updates.push(`role = $${paramIdx++}`); values.push(role); }
    if (agency !== undefined) { updates.push(`agency = $${paramIdx++}`); values.push(agency); }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, username, email, full_name, role, agency, is_active`,
      values
    );

    await auditService.log({
      userId: user.id,
      action: 'UPDATE_USER',
      entityType: 'users',
      entityId: id,
      oldValues: { is_active: currentUser.is_active, role: currentUser.role, agency: currentUser.agency },
      newValues: body,
      request,
    });

    // Send approval notification if user was activated
    if (is_active === true && !currentUser.is_active) {
      emailService.sendApprovalNotification(
        { fullName: currentUser.full_name, email: currentUser.email, username: currentUser.username, agency: currentUser.agency },
        true
      ).catch(err => console.error('[admin] Approval email failed:', err));
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
