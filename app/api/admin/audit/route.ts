import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { auditService } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const { searchParams } = new URL(request.url);
    const logs = await auditService.getAuditLogs({
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') || undefined,
      entityType: searchParams.get('entityType') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
