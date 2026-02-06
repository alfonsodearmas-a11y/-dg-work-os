import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('gpl_multivariate_forecasts')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No multivariate forecast available. Generate one first.',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        generatedAt: data.generated_at,
        dataPeriod: data.data_period,
        methodologySummary: data.methodology_summary,
        conservative: data.conservative_json,
        aggressive: data.aggressive_json,
        demandDrivers: data.demand_drivers_json,
        executiveSummary: data.executive_summary,
        metadata: {
          modelUsed: data.model_used,
          processingTimeMs: data.processing_time_ms,
          inputTokens: data.input_tokens,
          outputTokens: data.output_tokens,
          isFallback: data.is_fallback,
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
