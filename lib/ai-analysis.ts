import Anthropic from '@anthropic-ai/sdk';
import { parseAIJson } from '@/lib/parse-utils';
import { AI_MODEL, AI_MODEL_HAIKU } from '@/lib/constants/ai-config';

const CONFIG = {
  MODEL: AI_MODEL,
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.3,
};

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function buildAnalysisPrompt(metrics: any[], date: string): string {
  const metricsText = metrics
    .filter(m => m.value_type !== 'empty')
    .map(m => {
      const value = m.numeric_value !== null ? m.numeric_value : m.raw_value;
      const unit = m.unit ? ` ${m.unit}` : '';
      const agency = m.agency ? ` [${m.agency}]` : '';
      const error = m.has_error ? ' [ERROR]' : '';
      return `- ${m.metric_name}${agency}: ${value}${unit}${error}`;
    })
    .join('\n');

  const totalMetrics = metrics.filter(m => m.value_type !== 'empty').length;
  const errorMetrics = metrics.filter(m => m.has_error).length;

  return `You are analyzing daily operational metrics for the Ministry of Public Utilities and Aviation in Guyana. The data is from ${date}.

## Agencies Covered
- GPL (Guyana Power & Light) - Electricity generation and distribution
- GWI (Guyana Water Inc) - Water production and distribution
- CJIA (Cheddi Jagan International Airport) - Airport operations
- GCAA (Guyana Civil Aviation Authority) - Aviation regulation and safety

## Today's Metrics (${totalMetrics} values, ${errorMetrics} errors)

${metricsText}

## Your Analysis Task

Respond in JSON format:
{
  "executive_summary": "string",
  "anomalies": [{ "metric_name": "string", "value": "string", "reason": "string", "severity": "LOW|MEDIUM|HIGH", "recommendation": "string" }],
  "attention_items": [{ "agency": "string", "item": "string", "priority": "URGENT|HIGH|MEDIUM|LOW", "next_steps": "string" }],
  "agency_summaries": { "GPL": "string or null", "GWI": "string or null", "CJIA": "string or null", "GCAA": "string or null" }
}`;
}

function parseAnalysisResponse(response: string) {
  try {
    const parsed = parseAIJson<Record<string, unknown>>(response);
    return {
      executive_summary: (parsed.executive_summary as string) || 'Analysis completed.',
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      attention_items: Array.isArray(parsed.attention_items) ? parsed.attention_items : [],
      agency_summaries: (parsed.agency_summaries as Record<string, string>) || {},
    };
  } catch {
    return { executive_summary: response.slice(0, 500), anomalies: [], attention_items: [], agency_summaries: {}, raw_text: response };
  }
}

export async function analyzeMetrics(metrics: any[], date: string, options: { includeRaw?: boolean } = {}) {
  const startTime = Date.now();
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'AI analysis not configured (missing API key)', skipped: true };
    }
    const client = getClient();
    const prompt = buildAnalysisPrompt(metrics, date);

    const response = await client.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const analysis = parseAnalysisResponse(responseText);

    return {
      success: true,
      analysis,
      meta: { model: CONFIG.MODEL, processingTimeMs: Date.now() - startTime, promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens },
      rawResponse: options.includeRaw ? responseText : undefined,
    };
  } catch (error: any) {
    const isRetryable = error.status === 429 || error.status === 500 || error.status === 503;
    return { success: false, error: error.message, isRetryable, processingTimeMs: Date.now() - startTime };
  }
}

interface GPLBriefingContext {
  reportDate: string;
  systemOverview: any;
  renewables: any;
  unitStats: any;
  stations: any[];
  criticalStations: string[];
  outages: any[];
}

function buildGPLPrompt(context: GPLBriefingContext): string {
  const { reportDate, systemOverview, renewables, stations, outages } = context;

  // Pre-compute derived metrics so the AI never does its own math
  const eveningOnBars = systemOverview.eveningPeak?.onBars ?? null;
  const eveningSuppressed = systemOverview.eveningPeak?.suppressed ?? null;
  const eveningDemandGapMw = (eveningOnBars != null && eveningSuppressed != null)
    ? Math.round((eveningSuppressed - eveningOnBars) * 100) / 100
    : null;
  const eveningDemandGapPct = (eveningDemandGapMw != null && eveningSuppressed != null && eveningSuppressed > 0)
    ? Math.round((eveningDemandGapMw / eveningSuppressed) * 10000) / 100
    : null;

  const totalAvailableMw: number | null = systemOverview.availableCapacityMw
    ?? stations.reduce((sum: number, s: any) => sum + (s.availableMw || 0), 0);
  const expectedPeakMw: number | null = systemOverview.expectedPeakMw ?? null;
  const reserveMarginPct = (totalAvailableMw != null && expectedPeakMw != null && totalAvailableMw > 0)
    ? Math.round(((totalAvailableMw - expectedPeakMw) / totalAvailableMw) * 10000) / 100
    : null;

  const expectedReserveMw: number | null = systemOverview.expectedReserveMw ?? null;

  // Per-station lines and offline detection
  const stationLines = stations.map((s: any) => {
    const availPct = s.capacityMw > 0 ? Math.round((s.availableMw / s.capacityMw) * 10000) / 100 : 0;
    return `  - ${s.name}: ${s.availableMw?.toFixed(1) || 0} MW avail / ${s.capacityMw?.toFixed(1) || 0} MW derated, ${s.online || 0}/${s.units || 0} units online, ${availPct}% availability`;
  }).join('\n');

  const stationsFullyOffline = stations
    .filter((s: any) => (s.availableMw === 0 || s.availableMw == null) && (s.units || 0) > 0)
    .map((s: any) => `${s.name} (${s.capacityMw?.toFixed(1) || 0} MW derated, ${s.units} units)`);

  const totalUnitsOnline = stations.reduce((sum: number, s: any) => sum + (s.online || 0), 0);
  const totalUnitsAll = stations.reduce((sum: number, s: any) => sum + (s.units || 0), 0);

  const outageLines = outages.length > 0
    ? outages.map((o: any) => `  - ${o.station} ${o.unit || ''}: ${o.reason || 'Unknown'}${o.expectedCompletion ? ` (ETA: ${o.expectedCompletion})` : ''}`).join('\n')
    : '  None reported';

  return `You are a power grid data analyst for the Demerara-Berbice Interconnected System (DBIS) in Guyana. You produce a concise executive briefing for the Director General of the Ministry of Public Utilities.

YOUR ROLE IS STRICTLY DATA ANALYSIS. You report facts and flag threshold breaches. You do NOT:
- Make recommendations or suggest actions
- Use the phrase "load shedding"
- Flag Onverwagt station for having zero capacity (this is deliberate and permanent; exclude it from offline counts, concern flags, and capacity loss calculations entirely)
- Suggest maintenance, investigations, emergency protocols, or operational changes
- Use alarmist language ("severe", "critical failure", "emergency")

## Report Date: ${reportDate}

## PRE-COMPUTED METRICS (use these directly, do NOT recompute)
- Total Available Capacity: ${totalAvailableMw != null ? totalAvailableMw.toFixed(2) : 'N/A'} MW
- Expected Peak Demand: ${expectedPeakMw != null ? expectedPeakMw.toFixed(2) : 'N/A'} MW
- Reserve Capacity: ${systemOverview.reserveCapacityMw?.toFixed(2) || 'N/A'} MW
- Reserve Margin: ${reserveMarginPct != null ? reserveMarginPct.toFixed(1) + '%' : 'N/A'}
- Expected Reserve (after FOR): ${expectedReserveMw != null ? expectedReserveMw.toFixed(2) : 'N/A'} MW
- Units Online: ${totalUnitsOnline} / ${totalUnitsAll} (Onverwagt excluded)
- Evening Peak On-Bars: ${eveningOnBars != null ? eveningOnBars.toFixed(2) : 'N/A'} MW
- Evening Peak Suppressed: ${eveningSuppressed != null ? eveningSuppressed.toFixed(2) : 'N/A'} MW
- Evening Demand Gap: ${eveningDemandGapMw != null ? eveningDemandGapMw.toFixed(2) + ' MW' : 'N/A'}${eveningDemandGapPct != null ? ` (${eveningDemandGapPct.toFixed(1)}% of suppressed demand)` : ''}
- Stations Fully Offline (excl. Onverwagt): ${stationsFullyOffline.length > 0 ? stationsFullyOffline.join('; ') : 'None'}

## RENEWABLES
- Hampshire Solar: ${renewables.hampshireMwp || 0} MWp
- Prospect Solar: ${renewables.prospectMwp || 0} MWp
- Trafalgar Solar: ${renewables.trafalgarMwp || 0} MWp
- Total Renewable: ${renewables.totalMwp || 0} MWp

## FLEET STATUS (per station, Onverwagt excluded)
${stationLines}

## CURRENT OUTAGES (from Generation Status sheet)
${outageLines}

UNDERSTANDING THE PEAK DEMAND DATA:
- on_bars = what was actually served on the grid
- suppressed = estimated total demand if no supply constraints
- demand_gap = suppressed minus on_bars (the unmet demand)
- These are NOT additive. The suppressed number INCLUDES the on_bars number.
- NEVER add on_bars + suppressed together.

Respond in JSON format:
{
  "executiveBriefing": {
    "headline": "1-2 sentences: total available capacity, units online/total, reserve position vs expected peak, evening peak with demand gap if applicable",
    "sections": [
      {
        "title": "System Status",
        "severity": "positive (reserve margin > 20% AND demand gap < 5%) | warning (reserve margin 10-20% OR demand gap 5-15%) | critical (reserve margin < 10% OR demand gap > 15% OR expected reserve negative)",
        "summary": "Good / Watch / Warning — one sentence with the driving metric",
        "detail": "which threshold drove the status determination"
      },
      {
        "title": "Fleet Snapshot",
        "severity": "stable",
        "summary": "one-line station count and availability summary",
        "detail": "Per station (excluding Onverwagt): available MW / derated MW, units online / total, availability %. Flag stations below 50%."
      }
    ]
  },
  "criticalAlerts": [
    { "severity": "CRITICAL | WARNING | INFO", "title": "short factual title", "description": "factual statement with numbers, no recommendations" }
  ]
}

ALERT RULES (generate an alert ONLY if the condition is met):
- Expected reserve < 0 MW → CRITICAL: "Negative expected reserve: X MW. Available capacity may be insufficient to meet demand with forced outage contingency."
- Demand gap > 10 MW → WARNING if gap > 15% of suppressed, else INFO: "Evening demand gap: X MW (Y% of suppressed demand). On-bars: A MW, Suppressed: B MW."
- Any station at 0 MW across all units → WARNING: "[Station] fully offline: X MW derated capacity, N units."
- Reserve margin < 10% → WARNING: "Reserve margin at X%. Total available: Y MW, Expected peak: Z MW."

Alert severity assignment:
- CRITICAL: only if expected reserve < 0
- WARNING: reserve margin < 10% OR demand gap > 15% of suppressed demand
- INFO: everything else

Each alert is a factual statement. No arrows, no action text, no recommendations.
Severity values for sections: "critical" (red), "warning" (amber), "stable" (blue), "positive" (green).`;
}

export async function generateGPLBriefing(context: GPLBriefingContext) {
  const startTime = Date.now();
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'AI analysis not configured', executiveBriefing: { headline: 'AI analysis is not available.', sections: [] }, criticalAlerts: [] };
    }
    const client = getClient();
    const prompt = buildGPLPrompt(context);
    const response = await client.messages.create({ model: CONFIG.MODEL, max_tokens: CONFIG.MAX_TOKENS, messages: [{ role: 'user', content: prompt }] });
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    let parsed;
    try {
      parsed = parseAIJson<Record<string, any>>(responseText);
    } catch {
      parsed = { executiveBriefing: { headline: responseText.split('\n')[0]?.slice(0, 200) || 'Analysis completed.', sections: [{ title: 'Full Analysis', severity: 'stable', summary: '', detail: responseText.slice(0, 2000) }] }, criticalAlerts: [] };
    }

    // Handle executiveBriefing — can be structured object (new) or plain string (legacy)
    let executiveBriefing = parsed.executiveBriefing;
    if (typeof executiveBriefing === 'string') {
      // Legacy format — wrap in structured object for consistent handling
      executiveBriefing = {
        headline: executiveBriefing.split('\n')[0]?.slice(0, 200) || 'Analysis completed.',
        sections: [{ title: 'Full Analysis', severity: 'stable', summary: executiveBriefing.split('\n')[0]?.slice(0, 120) || '', detail: executiveBriefing }],
      };
    } else if (!executiveBriefing || !executiveBriefing.headline) {
      executiveBriefing = { headline: 'Analysis completed.', sections: [] };
    }

    return {
      success: true,
      executiveBriefing,
      criticalAlerts: parsed.criticalAlerts || [],
      usage: { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens },
    };
  } catch (error: any) {
    return { success: false, error: error.message, executiveBriefing: { headline: `AI analysis failed: ${error.message}`, sections: [] }, criticalAlerts: [] };
  }
}

export async function healthCheck() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { healthy: false, configured: false, error: 'ANTHROPIC_API_KEY not set' };
    const client = getClient();
    await client.messages.create({ model: AI_MODEL_HAIKU, max_tokens: 10, messages: [{ role: 'user', content: 'Respond with "OK"' }] });
    return { healthy: true, configured: true, model: CONFIG.MODEL };
  } catch (error: any) {
    return { healthy: false, configured: true, error: error.message };
  }
}

export { buildAnalysisPrompt, buildGPLPrompt, CONFIG };
