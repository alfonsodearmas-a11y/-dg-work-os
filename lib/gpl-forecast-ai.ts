/**
 * GPL Forecast AI Service
 *
 * Generates strategic briefings using Claude API
 * based on computed forecast data.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from './db-pg';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DemandForecast {
  grid: string;
  projected_month: string;
  projected_peak_mw: number;
  confidence_low_mw: number;
  confidence_high_mw: number;
  growth_rate_pct: number;
  data_source: string;
}

interface CapacityTimeline {
  grid: string;
  current_capacity_mw: number;
  projected_capacity_mw: number;
  shortfall_date: string | null;
  reserve_margin_pct: number;
  months_until_shortfall: number | null;
  risk_level: string;
}

interface LoadShedding {
  period_days: number;
  avg_shed_mw: number;
  max_shed_mw: number;
  shed_days_count: number;
  trend: string;
  projected_avg_6mo: number;
}

interface StationReliability {
  station: string;
  period_days: number;
  uptime_pct: number;
  avg_utilization_pct: number;
  total_units: number;
  online_units: number;
  offline_units: number;
  failure_count: number;
  mtbf_days: number;
  trend: string;
  risk_level: string;
}

interface UnitRisk {
  station: string;
  engine: string;
  unit_number: string;
  derated_mw: number;
  uptime_pct_90d: number;
  failure_count_90d: number;
  mtbf_days: number;
  days_since_last_failure: number;
  predicted_failure_days: number;
  risk_level: string;
  risk_score: number;
}

interface KpiForecast {
  kpi_name: string;
  projected_month: string;
  projected_value: number;
  confidence_low: number;
  confidence_high: number;
  trend: string;
}

interface ForecastData {
  demandForecasts: DemandForecast[];
  capacityTimeline: CapacityTimeline[];
  loadShedding: LoadShedding;
  stationReliability: StationReliability[];
  unitRisk: UnitRisk[];
  kpiForecasts: KpiForecast[];
}

interface PromptData extends ForecastData {
  dailyDataPoints: number;
  monthlyDataPoints: number;
  dataThrough: string;
}

interface BriefingSections {
  demandOutlook: string;
  capacityRisk: string;
  infrastructureReliability: string;
  customerRevenueImpact: string;
  essequiboAssessment: string;
  recommendations: string[];
}

interface BriefingResult {
  success: boolean;
  briefing?: string;
  sections?: BriefingSections;
  usage?: {
    promptTokens: number | undefined;
    completionTokens: number | undefined;
  };
  processingTimeMs?: number;
  error?: string;
}

interface AiAnalysisRow {
  id: number;
  analysis_type: string;
  data_through_date: string;
  daily_data_points: number;
  monthly_data_points: number;
  executive_briefing: string;
  demand_outlook: string;
  capacity_risk: string;
  infrastructure_reliability: string;
  customer_revenue_impact: string;
  essequibo_assessment: string;
  recommendations: string;
  raw_response: string;
  prompt_tokens: number;
  completion_tokens: number;
  processing_time_ms: number;
  generated_at: string;
}

interface FullAnalysisResult {
  forecasts: ForecastData;
  ai: BriefingResult;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const AI_CONFIG = {
  MODEL: 'claude-sonnet-4-5-20250929',
  MAX_TOKENS: 6000,
  TEMPERATURE: 0.3,
} as const;

// ── Helpers (imported dynamically to avoid circular deps) ──────────────────────

async function getForecasting() {
  // Dynamic import to avoid circular dependency issues
  const mod = await import('./gpl-forecasting');
  return mod;
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────

/**
 * Build the strategic analysis prompt
 */
export function buildStrategicPrompt(data: PromptData): string {
  const {
    demandForecasts,
    capacityTimeline,
    loadShedding,
    stationReliability,
    unitRisk,
    kpiForecasts,
    dailyDataPoints,
    monthlyDataPoints,
    dataThrough,
  } = data;

  // Format demand forecasts
  const dbisForecasts = demandForecasts.filter(f => f.grid === 'DBIS').slice(0, 12);
  const esqForecasts = demandForecasts.filter(f => f.grid === 'Essequibo').slice(0, 12);

  let demandText = 'DEMAND FORECASTS (next 12 months):\n';
  demandText += '\nDBIS Grid:\n';
  dbisForecasts.forEach(f => {
    demandText += `  ${f.projected_month}: ${f.projected_peak_mw} MW (${f.confidence_low_mw}-${f.confidence_high_mw})\n`;
  });
  if (esqForecasts.length > 0) {
    demandText += '\nEssequibo Grid:\n';
    esqForecasts.forEach(f => {
      demandText += `  ${f.projected_month}: ${f.projected_peak_mw} MW\n`;
    });
  }

  // Format capacity timeline
  let capacityText = '\nCAPACITY ADEQUACY:\n';
  capacityTimeline.forEach(c => {
    capacityText += `\n${c.grid} Grid:\n`;
    capacityText += `  Current Capacity: ${c.current_capacity_mw} MW\n`;
    capacityText += `  Reserve Margin: ${c.reserve_margin_pct}%\n`;
    capacityText += `  Risk Level: ${c.risk_level.toUpperCase()}\n`;
    if (c.shortfall_date) {
      capacityText += `  SHORTFALL DATE: ${c.shortfall_date} (${c.months_until_shortfall} months)\n`;
    }
  });

  // Format load shedding
  let sheddingText = '\nLOAD SHEDDING ANALYSIS:\n';
  sheddingText += `  Period Analyzed: ${loadShedding.period_days} days\n`;
  sheddingText += `  Average Daily Shedding: ${loadShedding.avg_shed_mw} MW\n`;
  sheddingText += `  Maximum Shedding: ${loadShedding.max_shed_mw} MW\n`;
  sheddingText += `  Days with Shedding: ${loadShedding.shed_days_count}\n`;
  sheddingText += `  Trend: ${loadShedding.trend.toUpperCase()}\n`;
  sheddingText += `  Projected 6-month Average: ${loadShedding.projected_avg_6mo} MW\n`;

  // Format station reliability
  let reliabilityText = '\nSTATION RELIABILITY (90-day analysis):\n';
  stationReliability.forEach(s => {
    const status = s.risk_level === 'critical' ? '🔴' : s.risk_level === 'warning' ? '🟡' : '🟢';
    reliabilityText += `\n${s.station} ${status}:\n`;
    reliabilityText += `  Uptime: ${s.uptime_pct}%\n`;
    reliabilityText += `  Utilization: ${s.avg_utilization_pct}%\n`;
    reliabilityText += `  Units: ${s.online_units}/${s.total_units} online\n`;
    reliabilityText += `  Failures: ${s.failure_count}, MTBF: ${s.mtbf_days} days\n`;
    reliabilityText += `  Trend: ${s.trend}\n`;
  });

  // Format high-risk units
  let unitText = '\nHIGH-RISK UNITS:\n';
  const highRiskUnits = unitRisk.filter(u => u.risk_level === 'high' || u.risk_level === 'medium').slice(0, 15);
  if (highRiskUnits.length === 0) {
    unitText += '  No high-risk units identified.\n';
  } else {
    highRiskUnits.forEach(u => {
      unitText += `\n${u.station} - ${u.unit_number} (${u.derated_mw} MW):\n`;
      unitText += `  Uptime: ${u.uptime_pct_90d}%\n`;
      unitText += `  Failures (90d): ${u.failure_count_90d}\n`;
      unitText += `  MTBF: ${u.mtbf_days} days\n`;
      unitText += `  Risk: ${u.risk_level.toUpperCase()} (score: ${u.risk_score})\n`;
    });
  }

  // Format KPI forecasts
  let kpiText = '\nKPI FORECASTS (6-month projections):\n';
  const kpiNames = [...new Set(kpiForecasts.map(k => k.kpi_name))];
  kpiNames.forEach(name => {
    const forecasts = kpiForecasts.filter(k => k.kpi_name === name).slice(0, 6);
    if (forecasts.length > 0) {
      kpiText += `\n${name}:\n`;
      kpiText += `  Trend: ${forecasts[0].trend}\n`;
      kpiText += `  Projections: ${forecasts.map(f => `${f.projected_month.slice(0, 7)}: ${f.projected_value}`).join(', ')}\n`;
    }
  });

  return `You are the Director General's strategic planning analyst for GPL (Guyana Power & Light). You have access to computed forecasts derived from ${dailyDataPoints} days of daily generation data and ${monthlyDataPoints} months of KPI data, through ${dataThrough}.

${demandText}
${capacityText}
${sheddingText}
${reliabilityText}
${unitText}
${kpiText}

Based on this data, produce an executive strategic briefing with the following sections:

## 1. DEMAND OUTLOOK
Analyze peak demand growth trajectory for both DBIS and Essequibo grids. State projected demand at 6, 12, and 24 months. Identify what's driving growth. Be specific with MW values.

## 2. CAPACITY & RESERVE RISK
When will demand exceed capacity? Current reserve margin trend. How much load shedding is occurring daily and is it growing? What does this mean for blackout risk? Use specific dates and MW values.

## 3. INFRASTRUCTURE RELIABILITY
Which stations are failing? Which are the backbone of the grid? Any critical units degrading? Specifically flag any stations with <50% uptime. Identify the top 5 most critical reliability concerns.

## 4. CUSTOMER & REVENUE IMPACT
Based on the KPI forecasts, what's the trend in affected customers? Is it linked to load shedding? Collection rate vs 95% target - what's the revenue risk?

## 5. ESSEQUIBO GRID ASSESSMENT
Separate assessment of the Essequibo grid - demand vs capacity trajectory, when is shortfall expected?

## 6. RECOMMENDATIONS
Provide 5-7 specific, actionable recommendations:
- Capacity additions needed by when (specific MW and dates)
- Stations to retire or overhaul
- Priority maintenance targets
- Revenue collection interventions

Use specific numbers, dates, and MW values throughout. This goes to the Director General and Minister for budget and policy decisions. Be direct and avoid hedging language.`;
}

// ── Section Parser ─────────────────────────────────────────────────────────────

/**
 * Parse sections from briefing text
 */
function parseBriefingSections(text: string): BriefingSections {
  const sections: BriefingSections = {
    demandOutlook: '',
    capacityRisk: '',
    infrastructureReliability: '',
    customerRevenueImpact: '',
    essequiboAssessment: '',
    recommendations: [],
  };

  // Extract sections by headers
  const demandMatch = text.match(/##?\s*1\.?\s*DEMAND OUTLOOK([\s\S]*?)(?=##?\s*2\.|$)/i);
  if (demandMatch) sections.demandOutlook = demandMatch[1].trim();

  const capacityMatch = text.match(/##?\s*2\.?\s*CAPACITY.*?RISK([\s\S]*?)(?=##?\s*3\.|$)/i);
  if (capacityMatch) sections.capacityRisk = capacityMatch[1].trim();

  const infraMatch = text.match(/##?\s*3\.?\s*INFRASTRUCTURE.*?RELIABILITY([\s\S]*?)(?=##?\s*4\.|$)/i);
  if (infraMatch) sections.infrastructureReliability = infraMatch[1].trim();

  const customerMatch = text.match(/##?\s*4\.?\s*CUSTOMER.*?IMPACT([\s\S]*?)(?=##?\s*5\.|$)/i);
  if (customerMatch) sections.customerRevenueImpact = customerMatch[1].trim();

  const esqMatch = text.match(/##?\s*5\.?\s*ESSEQUIBO.*?ASSESSMENT([\s\S]*?)(?=##?\s*6\.|$)/i);
  if (esqMatch) sections.essequiboAssessment = esqMatch[1].trim();

  const recsMatch = text.match(/##?\s*6\.?\s*RECOMMENDATIONS([\s\S]*?)$/i);
  if (recsMatch) {
    const recsText = recsMatch[1].trim();
    // Extract bullet points
    const bullets = recsText.match(/[-\u2022*]\s+.+/g) || [];
    sections.recommendations = bullets.map(b => b.replace(/^[-\u2022*]\s+/, '').trim());
  }

  return sections;
}

// ── Main Functions ─────────────────────────────────────────────────────────────

/**
 * Generate strategic briefing using Claude API
 */
export async function generateStrategicBriefing(forecastData: ForecastData): Promise<BriefingResult> {
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[gpl-forecast-ai] ANTHROPIC_API_KEY not configured');
    return {
      success: false,
      error: 'AI analysis not configured',
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Get data point counts via direct queries
    const dailyCountResult = await query('SELECT COUNT(*) as cnt FROM gpl_daily_summary');
    const dailyDataPoints = parseInt(dailyCountResult.rows[0]?.cnt || '0');
    const monthlyCountResult = await query('SELECT COUNT(DISTINCT report_month) as cnt FROM gpl_monthly_kpis');
    const monthlyDataPoints = parseInt(monthlyCountResult.rows[0]?.cnt || '0');
    const latestDateResult = await query('SELECT MAX(report_date) as latest FROM gpl_daily_summary');
    const dataThrough = latestDateResult.rows[0]?.latest
      ? new Date(latestDateResult.rows[0].latest).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const promptData: PromptData = {
      ...forecastData,
      dailyDataPoints,
      monthlyDataPoints,
      dataThrough,
    };

    const prompt = buildStrategicPrompt(promptData);

    console.log('[gpl-forecast-ai] Generating strategic briefing...');

    const response = await anthropic.messages.create({
      model: AI_CONFIG.MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      temperature: AI_CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const processingTime = Date.now() - startTime;

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Parse sections from response
    const sections = parseBriefingSections(responseText);

    // Save to database
    await query(`
      INSERT INTO gpl_forecast_ai_analysis (
        analysis_type, data_through_date, daily_data_points, monthly_data_points,
        executive_briefing, demand_outlook, capacity_risk, infrastructure_reliability,
        customer_revenue_impact, essequibo_assessment, recommendations,
        raw_response, prompt_tokens, completion_tokens, processing_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      'strategic_briefing',
      dataThrough,
      dailyDataPoints,
      monthlyDataPoints,
      responseText,
      sections.demandOutlook,
      sections.capacityRisk,
      sections.infrastructureReliability,
      sections.customerRevenueImpact,
      sections.essequiboAssessment,
      JSON.stringify(sections.recommendations),
      JSON.stringify(response),
      response.usage?.input_tokens,
      response.usage?.output_tokens,
      processingTime,
    ]);

    console.log(`[gpl-forecast-ai] Strategic briefing generated in ${processingTime}ms`);

    return {
      success: true,
      briefing: responseText,
      sections,
      usage: {
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      },
      processingTimeMs: processingTime,
    };

  } catch (err: any) {
    console.error('[gpl-forecast-ai] Error:', err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Get latest AI briefing from database
 */
export async function getLatestBriefing(): Promise<AiAnalysisRow | null> {
  const result = await query(`
    SELECT *
    FROM gpl_forecast_ai_analysis
    ORDER BY generated_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as AiAnalysisRow;
}

/**
 * Run full forecast + AI analysis pipeline
 */
export async function runFullAnalysis(): Promise<FullAnalysisResult> {
  console.log('[gpl-forecast-ai] Starting full analysis pipeline...');

  const forecasting = await getForecasting();

  // Run all forecasts
  const forecastData: ForecastData = await forecasting.runAllForecasts();

  // Generate AI briefing
  const aiResult = await generateStrategicBriefing(forecastData);

  return {
    forecasts: forecastData,
    ai: aiResult,
  };
}
