import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(
      `SELECT id, analysis_text, analysis_date, model_used, created_at
       FROM gpl_kpi_analysis
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
        message: 'No KPI analysis available',
      });
    }

    const row = result.rows[0];

    // Parse analysis_text if it's JSON with structured fields
    let analysis: Record<string, any> = {
      executive_briefing: row.analysis_text,
      date_range_start: row.analysis_date,
      date_range_end: row.analysis_date,
    };

    // Try parsing as JSON in case it contains structured data
    try {
      const parsed = JSON.parse(row.analysis_text);
      if (parsed && typeof parsed === 'object') {
        analysis = { ...analysis, ...parsed };
      }
    } catch {
      // Not JSON — use raw text as executive_briefing
    }

    return NextResponse.json({
      success: true,
      hasAnalysis: true,
      analysis,
    });
  } catch (error: any) {
    console.error('[gpl-kpi-analysis] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch KPI analysis' },
      { status: 500 }
    );
  }
}
