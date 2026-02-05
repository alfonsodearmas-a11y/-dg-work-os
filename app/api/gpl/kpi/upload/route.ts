import { NextRequest, NextResponse } from 'next/server';
import { parseKpiCsv } from '@/lib/gpl-kpi-csv-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No CSV file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'File must be a CSV' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseKpiCsv(buffer, file.name);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, warnings: result.warnings },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      preview: result.preview,
      data: result.data,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error('[gpl-kpi-upload] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to parse KPI CSV' },
      { status: 500 }
    );
  }
}
