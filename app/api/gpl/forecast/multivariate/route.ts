import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(
      `SELECT
         id, generated_at, data_period, methodology_summary,
         conservative_json, aggressive_json, demand_drivers_json,
         executive_summary, model_used, processing_time_ms,
         input_tokens, output_tokens, is_fallback
       FROM gpl_multivariate_forecasts
       ORDER BY generated_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No multivariate forecast available. Generate one first.',
      });
    }

    const row = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        generatedAt: row.generated_at,
        dataPeriod: row.data_period,
        methodologySummary: row.methodology_summary,
        conservative: row.conservative_json,
        aggressive: row.aggressive_json,
        demandDrivers: row.demand_drivers_json,
        executiveSummary: row.executive_summary,
        metadata: {
          modelUsed: row.model_used,
          processingTimeMs: row.processing_time_ms,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          isFallback: row.is_fallback,
        },
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-multivariate] GET Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch multivariate forecast' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let forecastResult;
    try {
      const { generateForecast } = await import('@/lib/gpl-multivariate-forecast');
      console.log(`[gpl-forecast-multivariate] Generation triggered by dg-admin`);
      forecastResult = await generateForecast();
    } catch (importError: any) {
      console.warn('[gpl-forecast-multivariate] Module unavailable:', importError.message);
      return NextResponse.json({
        success: true,
        message: 'Multivariate forecast generation is not yet available. The module is still being set up.',
        placeholder: true,
      });
    }

    if (!forecastResult.success) {
      return NextResponse.json(
        { success: false, error: forecastResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: forecastResult.forecast,
      warning: 'warning' in forecastResult ? forecastResult.warning : undefined,
      generatedBy: 'dg-admin',
    });
  } catch (error: any) {
    console.error('[gpl-forecast-multivariate] POST Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to generate multivariate forecast' },
      { status: 500 }
    );
  }
}
