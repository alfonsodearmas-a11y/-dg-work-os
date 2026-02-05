import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(
      `SELECT id, analysis_text, analysis_date, model_used, forecast_date, created_at
       FROM gpl_forecast_ai_analysis
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No AI strategic briefing available',
      });
    }

    const row = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        analysisText: row.analysis_text,
        analysisDate: row.analysis_date,
        modelUsed: row.model_used,
        forecastDate: row.forecast_date,
        createdAt: row.created_at,
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-briefing] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AI strategic briefing' },
      { status: 500 }
    );
  }
}
