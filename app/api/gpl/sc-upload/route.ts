import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { canUploadData } from '@/lib/auth-helpers';
import { processGPLUpload } from '@/lib/gpl/upload-pipeline';

export const maxDuration = 60;
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const result = await requireRole(['dg', 'agency_admin', 'officer']);
    if (result instanceof NextResponse) return result;
    const { session } = result;

    if (!canUploadData(session.user.role, session.user.agency, 'GPL')) {
      return NextResponse.json({ error: 'Cannot upload GPL data' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Invalid file type. Only .xls and .xlsx files are accepted.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await processGPLUpload(buffer, file.name, session.user.id);

    return NextResponse.json({
      success: true,
      snapshotId: uploadResult.snapshotId,
      snapshotDate: uploadResult.snapshotDate,
      counts: uploadResult.counts,
      warnings: uploadResult.warnings,
      metricsCount: uploadResult.metrics.length,
    });
  } catch (err) {
    console.error('[gpl/sc-upload] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
