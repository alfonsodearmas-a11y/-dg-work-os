import { NextRequest, NextResponse } from 'next/server';
import { parseDailyExcel } from '@/lib/daily-excel-parser';
import { requireRole } from '@/lib/auth-helpers';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File exceeds 10 MB limit' }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.xlsx', '.xls'].includes(ext)) {
      return NextResponse.json({ success: false, error: `Invalid file type: ${ext}. Only .xlsx and .xls files are allowed` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseDailyExcel(buffer);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      warnings: result.warnings,
      filename: file.name,
    });
  } catch (error: any) {
    console.error('[upload/daily] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to parse file' }, { status: 500 });
  }
}
