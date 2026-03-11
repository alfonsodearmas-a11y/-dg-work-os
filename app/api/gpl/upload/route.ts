import { NextRequest, NextResponse } from 'next/server';
import { parseGPLExcel } from '@/lib/gpl-excel-parser';
import { parseScheduleSheet } from '@/lib/gpl-schedule-parser';
import { parseStatusSheet } from '@/lib/gpl-status-parser';
import { requireUploadRole } from '@/lib/auth-helpers';
import { apiError, withErrorHandler } from '@/lib/api-utils';
import * as XLSX from 'xlsx';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireUploadRole('GPL');
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return apiError('VALIDATION_ERROR', 'No file provided. Upload an Excel file with the "file" field.', 400);
  }

  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
    return apiError('VALIDATION_ERROR', 'Invalid file type. Please upload an Excel file (.xlsx or .xls).', 400);
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return apiError('VALIDATION_ERROR', 'File too large. Maximum size is 10 MB.', 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const excelResult = parseGPLExcel(buffer);
  if (!excelResult.success || !excelResult.data) {
    return apiError('PARSE_ERROR', excelResult.error || 'Failed to parse Excel file', 422);
  }

  const scheduleResult = parseScheduleSheet(buffer);

  const reportDate = excelResult.data.reportDate || scheduleResult.data?.date || new Date().toISOString().split('T')[0];
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const statusResult = parseStatusSheet(workbook, reportDate);

  return NextResponse.json({
    success: true,
    preview: {
      fileName: file.name,
      fileSize: file.size,
      reportDate,
      generationStatus: excelResult.data,
      schedule: scheduleResult.success ? scheduleResult.data : null,
      outages: statusResult.success ? statusResult.outages : [],
      allUnits: statusResult.success ? statusResult.allUnits : [],
      warnings: [
        ...(scheduleResult.warnings || []),
        ...(statusResult.warnings || []),
      ],
    },
  });
});
