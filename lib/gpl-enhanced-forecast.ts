/**
 * GPL Enhanced Multivariate Forecast Service
 *
 * Uses Claude Opus for rigorous demand forecasting with seasonal decomposition,
 * 3 scenarios (conservative, most_likely, aggressive), and detailed methodology.
 * Results are cached in gpl_forecast_cache with data-hash invalidation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './db';
import { createHash } from 'crypto';

const AI_CONFIG = {
  MODEL: 'claude-opus-4-6',
  MAX_TOKENS: 8192,
  TEMPERATURE: 0.2,
} as const;

// --- Types ---

export interface MonthlyProjection {
  month: string;
  peak_mw: number;
  capacity_mw: number;
  reserve_pct: number;
}

export interface ScenarioForecast {
  growth_rate: number;
  monthly_projections: MonthlyProjection[];
}

export interface DemandDriver {
  factor: string;
  contribution_pct: number;
  trend: string;
}

export interface BriefingSection {
  title: string;
  severity: 'warning' | 'critical' | 'stable' | 'positive';
  summary: string;
  detail: string;
}

export interface EnhancedForecastResult {
  methodology: {
    model_type: string;
    r_squared: number;
    factors_used: string[];
    data_points: number;
    confidence_level: string;
  };
  scenarios: {
    conservative: ScenarioForecast;
    most_likely: ScenarioForecast;
    aggressive: ScenarioForecast;
  };
  seasonal_factors: Record<string, number>;
  demand_drivers: DemandDriver[];
  briefing: {
    headline: string;
    sections: BriefingSection[];
  };
  metadata: {
    generated_at: string;
    model: string;
    processing_time_ms: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    data_hash: string;
    is_fallback: boolean;
    data_period: string;
    data_points: number;
  };
}

// --- Data Assembly ---

interface HistoricalRow {
  month: string;
  peakDemandDBIS: number | null;
  peakDemandEsq: number | null;
  installedCapDBIS: number | null;
  installedCapEsq: number | null;
  collectionRate: number | null;
  affectedCustomers: number | null;
  hfoMix: number | null;
  lfoMix: number | null;
}

interface AssembledData {
  kpiRows: HistoricalRow[];
  latestDbis: Record<string, any> | null;
  latestStations: any[];
  dataHash: string;
  dataRange: { start: string; end: string; months: number };
}

async function assembleAllData(): Promise<AssembledData> {
  // Fetch ALL monthly KPI data
  const { data: rawKpis, error: kpiErr } = await supabaseAdmin
    .from('gpl_monthly_kpis')
    .select('report_month, kpi_name, value')
    .order('report_month', { ascending: true });

  if (kpiErr) throw kpiErr;

  // Group by month
  const byMonth: Record<string, Record<string, number>> = {};
  (rawKpis || []).forEach((r: any) => {
    const m = new Date(r.report_month).toISOString().slice(0, 7);
    if (!byMonth[m]) byMonth[m] = {};
    byMonth[m][r.kpi_name] = parseFloat(r.value);
  });

  const months = Object.keys(byMonth).sort();
  const kpiRows: HistoricalRow[] = months.map(m => {
    const d = byMonth[m];
    return {
      month: m,
      peakDemandDBIS: d['Peak Demand DBIS'] ?? null,
      peakDemandEsq: d['Peak Demand Essequibo'] ?? null,
      installedCapDBIS: d['Installed Capacity DBIS'] ?? null,
      installedCapEsq: d['Installed Capacity Essequibo'] ?? null,
      collectionRate: d['Collection Rate %'] ?? null,
      affectedCustomers: d['Affected Customers'] ?? null,
      hfoMix: d['HFO Generation Mix %'] ?? null,
      lfoMix: d['LFO Generation Mix %'] ?? null,
    };
  });

  // Fetch latest DBIS summary
  const { data: summaryRows } = await supabaseAdmin
    .from('gpl_daily_summary')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1);
  const latestDbis = summaryRows?.[0] || null;

  // Fetch latest stations
  let latestStations: any[] = [];
  if (latestDbis) {
    const { data: stRows } = await supabaseAdmin
      .from('gpl_daily_stations')
      .select('station, total_units, total_derated_capacity_mw, total_available_mw, units_online, units_offline')
      .eq('upload_id', latestDbis.upload_id);
    latestStations = stRows || [];
  }

  // Compute hash of all input data for cache invalidation
  const hashInput = JSON.stringify({
    kpiCount: kpiRows.length,
    lastMonth: months[months.length - 1] || '',
    latestDbisDate: latestDbis?.report_date || '',
  });
  const dataHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

  return {
    kpiRows,
    latestDbis,
    latestStations,
    dataHash,
    dataRange: {
      start: months[0] || 'N/A',
      end: months[months.length - 1] || 'N/A',
      months: months.length,
    },
  };
}

// --- Prompt Building ---

function buildEnhancedPrompt(data: AssembledData): string {
  const kpiTable = data.kpiRows
    .map(r =>
      `${r.month} | ${r.peakDemandDBIS?.toFixed(1) ?? '-'} | ${r.peakDemandEsq?.toFixed(1) ?? '-'} | ${r.installedCapDBIS?.toFixed(0) ?? '-'} | ${r.collectionRate?.toFixed(1) ?? '-'}% | ${r.affectedCustomers?.toLocaleString() ?? '-'} | ${r.hfoMix?.toFixed(1) ?? '-'}%`
    )
    .join('\n');

  const dbisInfo = data.latestDbis
    ? `\nLatest DBIS Report (${data.latestDbis.report_date}):
- Total Fossil Capacity: ${data.latestDbis.total_fossil_capacity_mw?.toFixed(1) ?? 'N/A'} MW
- Expected Peak Demand: ${data.latestDbis.expected_peak_demand_mw?.toFixed(1) ?? 'N/A'} MW
- Reserve Capacity: ${data.latestDbis.reserve_capacity_mw?.toFixed(1) ?? 'N/A'} MW
- Average FOR: ${data.latestDbis.average_for ?? 'N/A'}
- Evening Peak On Bars: ${data.latestDbis.evening_peak_on_bars_mw?.toFixed(1) ?? 'N/A'} MW
- Evening Peak Suppressed: ${data.latestDbis.evening_peak_suppressed_mw?.toFixed(1) ?? 'N/A'} MW
- Solar: Hampshire ${data.latestDbis.hampshire_solar_mwp ?? 0} MWp, Prospect ${data.latestDbis.prospect_solar_mwp ?? 0} MWp, Trafalgar ${data.latestDbis.trafalgar_solar_mwp ?? 0} MWp
- Total DBIS Capacity: ${data.latestDbis.total_dbis_capacity_mw?.toFixed(1) ?? 'N/A'} MW`
    : '';

  const stationLines = data.latestStations
    .map(s => `  - ${s.station}: ${s.units_online}/${s.total_units} units, ${parseFloat(s.total_available_mw).toFixed(1)}/${parseFloat(s.total_derated_capacity_mw).toFixed(1)} MW`)
    .join('\n');

  const dataSpansOil = data.dataRange.start <= '2020'
    ? `Data spans from ${data.dataRange.start} to ${data.dataRange.end}, covering the period before and during Guyana's oil production era which began in December 2019. This allows identification of structural demand shifts caused by the oil economy.`
    : `Data spans from ${data.dataRange.start} to ${data.dataRange.end} (${data.dataRange.months} months).`;

  return `You are an expert energy systems analyst for Guyana Power & Light. Analyze the following historical data and produce a rigorous demand forecast.

${dataSpansOil}

Historical KPI data (${data.kpiRows.length} months):
Month | DBIS Peak MW | Esq Peak MW | DBIS Cap MW | Collection % | Affected Customers | HFO Mix %
${kpiTable}
${dbisInfo}

${stationLines ? `\nStation Status:\n${stationLines}` : ''}

Consider these factors in your multivariate analysis:
- SEASONAL PATTERNS: Guyana has wet season (May-Aug, Nov-Jan) and dry season (Feb-Apr, Sep-Oct). Identify how demand varies by season from the historical data.
- RESIDENTIAL GROWTH: Guyana's population is growing with massive housing developments (especially on East Bank Demerara). Estimate residential demand growth rate.
- COMMERCIAL GROWTH: New shopping malls, hotels, and commercial buildings are being constructed rapidly due to oil economy. Factor in commercial load growth.
- INDUSTRIAL GROWTH: Oil and gas sector driving industrial expansion. Factor in industrial demand trajectory.
- TIME OF DAY PATTERNS: Evening peak (6-9pm) is consistently highest. Quantify the peak-to-average ratio.
- SYSTEM LOSSES: Currently 27-28%. Factor in whether loss reduction programs could free up effective capacity.
- RENEWABLE CONTRIBUTION: 10 MWp solar currently provides daytime support only. Not available for evening peak.
- UPCOMING CAPACITY: 300 MW gas-to-energy plant under construction at Wales, West Bank Demerara. Do NOT recommend new capacity — focus on transition period.
- ECONOMIC INDICATORS: Guyana's GDP growing 30%+ annually due to oil production. Correlate GDP growth with electricity demand growth.
- CLIMATE: Rising temperatures increase cooling load (AC penetration growing rapidly in Guyana).

Return a JSON response with this exact structure:
{
  "methodology": {
    "model_type": "Multivariate regression with seasonal decomposition",
    "r_squared": <calculated fit from the data>,
    "factors_used": ["list of factors with their estimated weights e.g. 'GDP growth (0.35)', 'Seasonal (0.15)'"],
    "data_points": ${data.kpiRows.length},
    "confidence_level": "85%"
  },
  "scenarios": {
    "conservative": { "growth_rate": <annual % growth>, "monthly_projections": [{"month": "YYYY-MM", "peak_mw": number, "capacity_mw": number, "reserve_pct": number}] for 24 months },
    "most_likely": { "growth_rate": <annual % growth>, "monthly_projections": [same format, 24 months] },
    "aggressive": { "growth_rate": <annual % growth>, "monthly_projections": [same format, 24 months] }
  },
  "seasonal_factors": { "jan": <multiplier>, "feb": <multiplier>, ... "dec": <multiplier> },
  "demand_drivers": [
    { "factor": "Residential", "contribution_pct": <number>, "trend": "description of trend" },
    { "factor": "Commercial", "contribution_pct": <number>, "trend": "description" },
    { "factor": "Industrial", "contribution_pct": <number>, "trend": "description" },
    { "factor": "Climate/Cooling", "contribution_pct": <number>, "trend": "description" },
    { "factor": "System Losses", "contribution_pct": <number>, "trend": "description" }
  ],
  "briefing": {
    "headline": "1-2 sentences with the key projection numbers and timeframe",
    "sections": [
      { "title": "Demand Trajectory", "severity": "warning|critical|stable", "summary": "one line with numbers", "detail": "full paragraph with analysis and numbers" },
      { "title": "Seasonal Risk Windows", "severity": "warning|critical|stable", "summary": "one line", "detail": "which months are highest risk for load shedding and why" },
      { "title": "Wales Transition", "severity": "warning|critical|stable", "summary": "one line", "detail": "analysis of the gap between now and when the 300MW Wales gas-to-energy plant comes online" },
      { "title": "Loss Reduction Impact", "severity": "stable|positive", "summary": "one line", "detail": "what a 5% loss reduction would mean for effective capacity in MW terms" }
    ]
  }
}

IMPORTANT:
- monthly_projections must have exactly 24 entries, one for each of the next 24 months starting from the month after the latest data
- capacity_mw should reflect current installed capacity (does NOT include the Wales plant which is under construction)
- reserve_pct = ((capacity_mw - peak_mw) / capacity_mw) * 100
- seasonal_factors are multipliers relative to annual average (e.g., 1.08 means 8% above average, 0.94 means 6% below)
- All numbers must be realistic and grounded in the data provided
- Respond ONLY with valid JSON, no markdown code fences`;
}

// --- Cache Management ---

async function getCachedForecast(dataHash: string): Promise<EnhancedForecastResult | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('gpl_forecast_cache')
      .select('forecast_json, generated_at')
      .eq('data_hash', dataHash)
      .order('generated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const row = data[0];
    const forecast = typeof row.forecast_json === 'string'
      ? JSON.parse(row.forecast_json)
      : row.forecast_json;

    return forecast as EnhancedForecastResult;
  } catch {
    return null;
  }
}

async function saveForecastToCache(
  forecast: EnhancedForecastResult,
  dataHash: string,
  promptTokens?: number,
  completionTokens?: number,
  processingTimeMs?: number
): Promise<void> {
  try {
    // Upsert by data_hash
    const { error } = await supabaseAdmin
      .from('gpl_forecast_cache')
      .upsert(
        {
          forecast_json: forecast,
          data_hash: dataHash,
          generated_at: new Date().toISOString(),
          model_used: AI_CONFIG.MODEL,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          processing_time_ms: processingTimeMs,
        },
        { onConflict: 'data_hash' }
      );

    if (error) console.error('[enhanced-forecast] Cache save error:', error.message);
  } catch (err: any) {
    console.error('[enhanced-forecast] Cache save error:', err.message);
  }
}

// --- Main API ---

export async function getEnhancedForecast(forceRegenerate = false): Promise<{
  success: boolean;
  forecast?: EnhancedForecastResult;
  error?: string;
  cached?: boolean;
}> {
  const startTime = Date.now();

  try {
    // Assemble data
    const data = await assembleAllData();

    if (data.kpiRows.length < 6) {
      return { success: false, error: `Insufficient data: only ${data.kpiRows.length} months available (need at least 6)` };
    }

    // Check cache unless force regenerate
    if (!forceRegenerate) {
      const cached = await getCachedForecast(data.dataHash);
      if (cached) {
        return { success: true, forecast: cached, cached: true };
      }
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
    }

    // Build prompt and call Claude Opus
    const prompt = buildEnhancedPrompt(data);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log(`[enhanced-forecast] Calling Claude Opus with ${data.kpiRows.length} months of data...`);

    const response = await anthropic.messages.create({
      model: AI_CONFIG.MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      temperature: AI_CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const processingTime = Date.now() - startTime;

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Parse JSON
    let parsed: any;
    try {
      // Try direct parse first, then extract from markdown
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr: any) {
      console.error('[enhanced-forecast] JSON parse error:', parseErr.message);
      console.log('[enhanced-forecast] Raw (first 500):', responseText.slice(0, 500));
      return { success: false, error: 'Failed to parse AI response' };
    }

    // Attach metadata
    const forecast: EnhancedForecastResult = {
      methodology: parsed.methodology || {
        model_type: 'AI-driven multivariate analysis',
        r_squared: 0,
        factors_used: [],
        data_points: data.kpiRows.length,
        confidence_level: 'N/A',
      },
      scenarios: parsed.scenarios || { conservative: { growth_rate: 0, monthly_projections: [] }, most_likely: { growth_rate: 0, monthly_projections: [] }, aggressive: { growth_rate: 0, monthly_projections: [] } },
      seasonal_factors: parsed.seasonal_factors || {},
      demand_drivers: parsed.demand_drivers || [],
      briefing: parsed.briefing || { headline: 'Forecast generated.', sections: [] },
      metadata: {
        generated_at: new Date().toISOString(),
        model: AI_CONFIG.MODEL,
        processing_time_ms: processingTime,
        prompt_tokens: response.usage?.input_tokens,
        completion_tokens: response.usage?.output_tokens,
        data_hash: data.dataHash,
        is_fallback: false,
        data_period: `${data.dataRange.start} to ${data.dataRange.end}`,
        data_points: data.kpiRows.length,
      },
    };

    // Save to cache
    await saveForecastToCache(
      forecast,
      data.dataHash,
      response.usage?.input_tokens,
      response.usage?.output_tokens,
      processingTime
    );

    console.log(`[enhanced-forecast] Generated in ${processingTime}ms (${response.usage?.input_tokens}/${response.usage?.output_tokens} tokens)`);

    return { success: true, forecast, cached: false };
  } catch (err: any) {
    console.error('[enhanced-forecast] Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get latest cached forecast (any hash)
 */
export async function getLatestCachedForecast(): Promise<EnhancedForecastResult | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('gpl_forecast_cache')
      .select('forecast_json')
      .order('generated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    return (typeof data[0].forecast_json === 'string'
      ? JSON.parse(data[0].forecast_json)
      : data[0].forecast_json) as EnhancedForecastResult;
  } catch {
    return null;
  }
}
