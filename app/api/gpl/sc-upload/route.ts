import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canUploadData } from '@/lib/auth-helpers';
import { processGPLUpload } from '@/lib/gpl/upload-pipeline';
import { apiError, withErrorHandler } from '@/lib/api-utils';

export const maxDuration = 60;
const MAX_SIZE = 10 * 1024 * 1024;

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  if (!canUploadData(session.user.role, session.user.agency, 'GPL')) {
    return NextResponse.json({ error: 'Cannot upload GPL data' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return apiError('VALIDATION_ERROR', 'No file provided', 400);
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    return apiError('VALIDATION_ERROR', 'Invalid file type. Only .xls and .xlsx files are accepted.', 400);
  }

  if (file.size > MAX_SIZE) {
    return apiError('VALIDATION_ERROR', 'File too large. Maximum size is 10MB.', 400);
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
});
