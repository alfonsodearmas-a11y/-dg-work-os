import { NextResponse, type NextRequest } from 'next/server';
import { parseGWIDocx } from '@/lib/gwi-docx-parser';
import { extractManagementReport, extractCSCRReport, extractProcurementReport } from '@/lib/gwi-report-extractor';
import { supabaseAdmin } from '@/lib/db';
import type { GWIReportType } from '@/lib/gwi-docx-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const reportType = formData.get('report_type') as GWIReportType | null;
    const reportPeriod = formData.get('report_period') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.match(/\.docx$/i)) {
      return NextResponse.json({ success: false, error: 'Only .docx files are supported' }, { status: 400 });
    }

    // Extract text from docx
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parseResult = await parseGWIDocx(buffer);

    // Use provided type or auto-detected type
    const finalType = reportType || parseResult.detectedType;

    // Extract structured data using Claude Sonnet
    let extractedData: Record<string, unknown> = {};

    if (finalType === 'management') {
      extractedData = await extractManagementReport(parseResult.text);
    } else if (finalType === 'cscr') {
      const cscrData = await extractCSCRReport(parseResult.text);
      extractedData = cscrData as unknown as Record<string, unknown>;
    } else if (finalType === 'procurement') {
      extractedData = await extractProcurementReport(parseResult.text);
    }

    // Track the upload
    await supabaseAdmin.from('gwi_uploaded_files').insert({
      filename: file.name,
      report_type: finalType,
      report_period: reportPeriod || new Date().toISOString().slice(0, 7) + '-01',
      parsed_data: extractedData,
    });

    return NextResponse.json({
      success: true,
      data: {
        filename: file.name,
        report_type: finalType,
        detected_type: parseResult.detectedType,
        detection_confidence: parseResult.confidence,
        word_count: parseResult.wordCount,
        extracted: extractedData,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[gwi/upload/parse] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
