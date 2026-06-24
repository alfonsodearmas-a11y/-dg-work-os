import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { reconcileUpload } from '@/lib/delayed-projects/reconcile';
import type { ParsedDelayedProject } from '@/lib/delayed-projects/upload-parser';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  let body: { rows: ParsedDelayedProject[]; fileName?: string; confirmFullExport?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rows, fileName, confirmFullExport } = body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const result = await reconcileUpload(rows, {
    fileName,
    uploadedBy: session.user.email,
    confirmFullExport,
  });

  if (result.needsConfirmation) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
