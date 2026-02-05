import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const result = await query(
      `SELECT id, username, email, full_name, role, agency, is_active, must_change_password, last_login, created_at
       FROM users ORDER BY created_at DESC`
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
