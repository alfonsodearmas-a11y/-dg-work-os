import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { requireRole } from '@/lib/auth-helpers';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.session.user.id;

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // 'acknowledge' or 'resolve'

    let result;
    if (action === 'resolve') {
      result = await query(
        'UPDATE alerts SET resolved_at = NOW(), resolved_by = $1, is_active = false WHERE id = $2 RETURNING *',
        [userId, id]
      );
    } else {
      result = await query(
        'UPDATE alerts SET acknowledged_at = NOW(), acknowledged_by = $1 WHERE id = $2 RETURNING *',
        [userId, id]
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
