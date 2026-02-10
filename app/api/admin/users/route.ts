import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const result = await query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.full_name,
         u.role,
         u.agency,
         u.is_active,
         u.must_change_password,
         u.last_login,
         u.created_at,
         COUNT(t.id) FILTER (WHERE t.status != 'verified') AS active_tasks,
         COUNT(t.id) FILTER (WHERE t.status = 'overdue') AS overdue_tasks,
         COUNT(t.id) FILTER (WHERE t.status = 'verified' AND t.verified_at >= NOW() - INTERVAL '30 days') AS completed_30d
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id
       GROUP BY u.id, u.username, u.email, u.full_name, u.role, u.agency, u.is_active, u.must_change_password, u.last_login, u.created_at
       ORDER BY u.created_at DESC`
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
