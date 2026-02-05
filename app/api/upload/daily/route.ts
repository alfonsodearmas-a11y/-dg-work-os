import { NextRequest, NextResponse } from 'next/server';
import { parseDailyExcel } from '@/lib/daily-excel-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
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
    return NextResponse.json({ success: false, error: `Failed to parse file: ${error.message}` }, { status: 500 });
  }
}
