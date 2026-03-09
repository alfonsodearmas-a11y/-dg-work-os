import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

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
    logger.error({ err: error }, 'Failed to fetch multivariate forecast');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch multivariate forecast' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler(async (_request: NextRequest) => {
  const session = await auth();
  const userId = session?.user?.id || 'system';
  let forecastResult;
  try {
    const { generateForecast } = await import('@/lib/gpl-multivariate-forecast');
    logger.info({ userId }, 'Multivariate forecast generation triggered');
    forecastResult = await generateForecast();
  } catch (importError: any) {
    logger.warn({ err: importError }, 'Multivariate forecast module unavailable');
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
    generatedBy: userId,
  });
});
