import { NextRequest, NextResponse } from 'next/server';
import { parseGPLExcel } from '@/lib/gpl-excel-parser';
import { parseScheduleSheet } from '@/lib/gpl-schedule-parser';
import { parseStatusSheet } from '@/lib/gpl-status-parser';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided. Upload an Excel file with the "file" field.' },
        { status: 400 }
      );
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls).' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse the main Generation Status sheet
    const excelResult = parseGPLExcel(buffer);
    if (!excelResult.success || !excelResult.data) {
      return NextResponse.json(
        { success: false, error: excelResult.error || 'Failed to parse Excel file' },
        { status: 422 }
      );
    }

    // Parse the Schedule sheet for detailed unit/station data
    const scheduleResult = parseScheduleSheet(buffer);

    // Parse the Generation Status sheet for outage information
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
  } catch (error: any) {
    console.error('[gpl/upload] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process GPL upload' },
      { status: 500 }
    );
  }
}
