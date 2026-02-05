import Anthropic from '@anthropic-ai/sdk';

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
  const byAgency: Record<string, any[]> = {};
  for (const metric of metrics) {
    if (metric.value_type === 'empty') continue;
    const agency = metric.agency || 'Unknown';
    if (!byAgency[agency]) byAgency[agency] = [];
    byAgency[agency].push(metric);
  }

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
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonStr = objectMatch[0];
    const parsed = JSON.parse(jsonStr);
    return {
      executive_summary: parsed.executive_summary || 'Analysis completed.',
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      attention_items: Array.isArray(parsed.attention_items) ? parsed.attention_items : [],
      agency_summaries: parsed.agency_summaries || {},
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
      temperature: CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');
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

  return `You are the AI briefing system for the Ministry of Public Utilities in Guyana, analyzing daily power generation data from GPL.

## Report Date: ${reportDate}

## SYSTEM OVERVIEW
- Total Fossil Fuel Capacity: ${systemOverview.totalCapacityMw?.toFixed(2) || 'N/A'} MW
- Available Capacity: ${systemOverview.availableCapacityMw?.toFixed(2) || 'N/A'} MW
- Expected Peak Demand: ${systemOverview.expectedPeakMw?.toFixed(2) || 'N/A'} MW
- Reserve Capacity: ${systemOverview.reserveCapacityMw?.toFixed(2) || 'N/A'} MW
- Evening Peak: ${systemOverview.eveningPeak?.onBars?.toFixed(2) || 'N/A'} MW on bars (${systemOverview.eveningPeak?.suppressed?.toFixed(2) || 'N/A'} MW suppressed)

## RENEWABLES
- Hampshire Solar: ${renewables.hampshireMwp || 0} MWp
- Prospect Solar: ${renewables.prospectMwp || 0} MWp
- Trafalgar Solar: ${renewables.trafalgarMwp || 0} MWp
- Total Renewable: ${renewables.totalMwp || 0} MWp

## UNIT STATUS
- Total: ${unitStats.total}, Online: ${unitStats.online}, Offline: ${unitStats.offline}, No Data: ${unitStats.noData}

## STATION BREAKDOWN
${stationLines}

## CRITICAL STATIONS (Below 50% utilization)
${criticalStations.length > 0 ? criticalStations.join(', ') : 'None'}

## CURRENT OUTAGES
${outageLines}

Respond in JSON format:
{
  "executiveBriefing": "3-5 paragraph executive summary",
  "criticalAlerts": [{ "severity": "CRITICAL|HIGH|MEDIUM", "title": "string", "description": "string", "recommendation": "string" }],
  "stationConcerns": [{ "station": "string", "issue": "string", "impact": "string", "priority": "HIGH|MEDIUM|LOW" }],
  "recommendations": [{ "category": "Operations|Maintenance|Planning|Policy", "recommendation": "string", "rationale": "string", "urgency": "Immediate|Short-term|Long-term" }]
}`;
}

export async function generateGPLBriefing(context: GPLBriefingContext) {
  const startTime = Date.now();
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'AI analysis not configured', executiveBriefing: 'AI analysis is not available.', criticalAlerts: [], stationConcerns: [], recommendations: [] };
    }
    const client = getClient();
    const prompt = buildGPLPrompt(context);
    const response = await client.messages.create({ model: CONFIG.MODEL, max_tokens: CONFIG.MAX_TOKENS, temperature: CONFIG.TEMPERATURE, messages: [{ role: 'user', content: prompt }] });
    const responseText = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n');

    let parsed;
    try {
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) jsonStr = objectMatch[0];
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { executiveBriefing: responseText.slice(0, 2000), criticalAlerts: [], stationConcerns: [], recommendations: [] };
    }

    return {
      success: true,
      executiveBriefing: parsed.executiveBriefing || 'Analysis completed.',
      criticalAlerts: parsed.criticalAlerts || [],
      stationConcerns: parsed.stationConcerns || [],
      recommendations: parsed.recommendations || [],
      usage: { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens },
    };
  } catch (error: any) {
    return { success: false, error: error.message, executiveBriefing: `AI analysis failed: ${error.message}`, criticalAlerts: [], stationConcerns: [], recommendations: [] };
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
