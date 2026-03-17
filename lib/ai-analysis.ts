import Anthropic from '@anthropic-ai/sdk';
import { parseAIJson } from '@/lib/parse-utils';

const CONFIG = {
  MODEL: 'claude-sonnet-4-5-20250929',
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
  const { reportDate, systemOverview, renewables, unitStats, stations, criticalStations, outages } = context;
  const stationLines = stations.map(s =>
    `  - ${s.name}: ${s.online}/${s.units} units online, ${s.availableMw?.toFixed(1) || 0}/${s.capacityMw?.toFixed(1) || 0} MW (${s.utilizationPct?.toFixed(1) || 0}%)`
  ).join('\n');
  const outageLines = outages.length > 0
    ? outages.map(o => `  - ${o.station} ${o.unit || ''}: ${o.reason || 'Unknown'}${o.expectedCompletion ? ` (ETA: ${o.expectedCompletion})` : ''}`).join('\n')
    : '  None reported';

  return `You are the AI briefing system for the Ministry of Public Utilities in Guyana, analyzing daily power generation data from GPL (Guyana Power & Light) on the DBIS (Demerara-Berbice Interconnected System).

## Report Date: ${reportDate}

## SYSTEM OVERVIEW
- Total Fossil Fuel Capacity: ${systemOverview.totalCapacityMw?.toFixed(2) || 'N/A'} MW
- Available Capacity: ${systemOverview.availableCapacityMw?.toFixed(2) || 'N/A'} MW
- Expected Peak Demand: ${systemOverview.expectedPeakMw?.toFixed(2) || 'N/A'} MW
- Reserve Capacity: ${systemOverview.reserveCapacityMw?.toFixed(2) || 'N/A'} MW
- System Utilization: ${systemOverview.systemUtilizationPct?.toFixed(1) || 'N/A'}%
- Reserve Margin: ${systemOverview.reserveMarginPct?.toFixed(1) || 'N/A'}%
- Evening Peak: ${systemOverview.eveningPeak?.onBars?.toFixed(2) || 'N/A'} MW on bars${systemOverview.eveningPeak?.suppressed ? ` (${systemOverview.eveningPeak.suppressed.toFixed(2)} MW suppressed/true demand)` : ''}

## RENEWABLES
- Hampshire Solar: ${renewables.hampshireMwp || 0} MWp
- Prospect Solar: ${renewables.prospectMwp || 0} MWp
- Trafalgar Solar: ${renewables.trafalgarMwp || 0} MWp
- Total Renewable: ${renewables.totalMwp || 0} MWp

## UNIT STATUS
- Total: ${unitStats.total}, Online: ${unitStats.online}, Offline: ${unitStats.offline}, No Data: ${unitStats.noData}

## STATION BREAKDOWN
${stationLines}

## STATIONS BELOW 50% UTILIZATION
${criticalStations.length > 0 ? criticalStations.join(', ') : 'None'}

## CURRENT OUTAGES (from Generation Status sheet)
${outageLines}

## ALERT THRESHOLDS
- CRITICAL: Expected reserve < 0 MW (demand exceeds expected available capacity)
- WARNING: Reserve margin < 10%
- INFO: Suppressed demand significantly exceeds on-bars demand (gap indicates unmet demand)

Respond in JSON format:
{
  "executiveBriefing": {
    "headline": "1-2 sentence newspaper-style summary with key numbers (MW values, unit counts, percentages). Example: 'GPL operating at 221.2 MW / 340.6 MW (65% capacity). 37 of 63 units online. Evening peak 200.4 MW on bars (220.2 MW suppressed).'",
    "sections": [
      { "title": "System Status", "severity": "critical|warning|stable|positive", "summary": "one-line summary with numbers", "detail": "full paragraph with factual analysis" },
      { "title": "Critical Issues", "severity": "critical|warning|stable|positive", "summary": "one-line: count of issues observed", "detail": "full paragraph listing each issue with MW impact" },
      { "title": "Positive Performance", "severity": "positive", "summary": "one-line: best-performing stations/metrics", "detail": "full paragraph with details" },
      { "title": "Outage Summary", "severity": "critical|warning|stable|positive", "summary": "one-line: count of offline units and total MW offline", "detail": "full paragraph listing offline units with outage reasons and expected completion dates" }
    ]
  },
  "criticalAlerts": [{ "severity": "CRITICAL|WARNING|INFO", "title": "string", "description": "string" }]
}

CONSTRAINTS — you MUST follow these:
- Report ONLY observed facts from the data above. Do not speculate or extrapolate.
- Do NOT suggest maintenance actions, operational changes, or policy recommendations.
- Do NOT mention "load shedding" — the spreadsheet does not track load shedding directly.
- Do NOT use words like "recommend", "should", "consider", "suggest", "advise".
- Do NOT mention Onverwagt station (it is deliberately empty, not a concern).
- Alerts must describe WHAT is happening, not what to do about it.
- Each section "summary" must be exactly ONE line with specific numbers.
- Each section "detail" is the full analysis paragraph.
- severity values: "critical" (red), "warning" (amber), "stable" (blue), "positive" (green).`;
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
    await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'Respond with "OK"' }] });
    return { healthy: true, configured: true, model: CONFIG.MODEL };
  } catch (error: any) {
    return { healthy: false, configured: true, error: error.message };
  }
}

export { buildAnalysisPrompt, buildGPLPrompt, CONFIG };
