import { NextRequest, NextResponse } from 'next/server';
import { parseKpiCsv } from '@/lib/gpl-kpi-csv-parser';
import { requireUploadRole } from '@/lib/auth-helpers';
import { apiError, withErrorHandler } from '@/lib/api-utils';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireUploadRole('GPL');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return apiError('VALIDATION_ERROR', 'No CSV file provided', 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return apiError('VALIDATION_ERROR', 'File exceeds 10 MB limit', 400);
  }

  if (!file.name.endsWith('.csv')) {
    return apiError('VALIDATION_ERROR', 'File must be a CSV', 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseResult = parseKpiCsv(buffer, file.name);

  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: parseResult.error, warnings: parseResult.warnings },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    preview: parseResult.preview,
    data: parseResult.data,
    warnings: parseResult.warnings,
  });
});
