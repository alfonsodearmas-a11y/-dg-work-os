import Anthropic from '@anthropic-ai/sdk';
import type { GPLAnalysis, GWIAnalysis, PendingApplication } from './pending-applications-types';

const CONFIG = {
  MODEL: 'claude-sonnet-4-6',
  MAX_TOKENS: 4096,
  TEMPERATURE: 0.3,
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

function parseJSONResponse(text: string): Record<string, unknown> {
  let jsonStr = text;
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1];
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];
  return JSON.parse(jsonStr);
}

// ── GPL Deep Analysis ────────────────────────────────────────────────────────

export async function generateGPLDeepAnalysis(records: PendingApplication[], analysis: GPLAnalysis) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'AI analysis not configured (missing API key)' };
  }

  const pipelineText = analysis.pipeline
    .map(s => `  - ${s.stage}: ${s.count} orders, avg ${s.avgDays}d, SLA ${s.slaDays}d, compliance ${s.compliancePct}% (${s.slaBreached} breached)`)
    .join('\n');

  const agingText = analysis.agingBuckets
    .map(b => `  - ${b.label}: ${b.count} (${b.pct}%)`)
    .join('\n');

  const acctText = analysis.accountTypes.slice(0, 10)
    .map(a => `  - ${a.type}: ${a.count} orders, avg ${a.avgDays}d`)
    .join('\n');

  const regionBreakdown = new Map<string, number>();
  for (const r of records) {
    const region = r.region || 'Unknown';
    regionBreakdown.set(region, (regionBreakdown.get(region) || 0) + 1);
  }
  const regionText = Array.from(regionBreakdown.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([r, c]) => `  - ${r}: ${c}`)
    .join('\n');

  const prompt = `You are the AI advisor for the Director General of the Ministry of Public Utilities in Guyana, analyzing GPL (Guyana Power & Light) pending new service connection applications.

## Data Summary
- Total pending orders: ${records.length}
- Data as of: ${records[0]?.dataAsOf || 'Unknown'}

## Pipeline Funnel
${pipelineText}

## Aging Distribution
${agingText}

## Account Types
${acctText}

## Geographic Distribution (Top 15)
${regionText}

## Red Flags Detected
${analysis.redFlags.length > 0 ? analysis.redFlags.map(f => `- ${f}`).join('\n') : '- None'}

Respond in JSON:
{
  "executiveSummary": "2-3 sentence executive summary with key numbers for the DG",
  "sections": [
    { "title": "Pipeline Bottleneck Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line with numbers", "detail": "full analysis paragraph" },
    { "title": "SLA Compliance Assessment", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "full analysis" },
    { "title": "Aging & Backlog Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of long-waiting applications and backlog trends" },
    { "title": "Geographic Hotspots", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of regional patterns" },
    { "title": "Revenue Impact", "severity": "warning|stable", "summary": "estimated connections delayed", "detail": "analysis of backlog cost" }
  ],
  "recommendations": [
    { "category": "Operations|Staffing|Process|Policy", "recommendation": "specific action", "urgency": "Immediate|Short-term|Long-term" }
  ]
}`;

  try {
    const response = await getClient().messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('\n');
    const parsed = parseJSONResponse(text);

    return {
      success: true,
      executiveSummary: String(parsed.executiveSummary || ''),
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      usage: { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── GWI Deep Analysis ────────────────────────────────────────────────────────

export async function generateGWIDeepAnalysis(records: PendingApplication[], analysis: GWIAnalysis) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'AI analysis not configured (missing API key)' };
  }

  const agingText = analysis.agingBuckets
    .map(b => `  - ${b.label}: ${b.count} (${b.pct}%)`)
    .join('\n');

  const regionText = analysis.regions.slice(0, 10)
    .map(r => `  - ${r.region}: ${r.count} applications, avg ${r.avgDays}d, max ${r.maxDays}d`)
    .join('\n');

  const clusterText = analysis.communityClusters.slice(0, 10)
    .map(c => `  - ${c.village} (${c.region}): ${c.count} pending, avg ${c.avgDays}d`)
    .join('\n') || '  None with 5+ applications';

  const prompt = `You are the AI advisor for the Director General of the Ministry of Public Utilities in Guyana, analyzing GWI (Guyana Water Inc) pending new water service connection applications.

## Data Summary
- Total pending applications: ${records.length}
- Data as of: ${records[0]?.dataAsOf || 'Unknown'}

## Aging Distribution
${agingText}

## Regional Distribution (Top 10)
${regionText}

## Community Clusters (5+ pending applications)
${clusterText}

## Red Flags Detected
${analysis.redFlags.length > 0 ? analysis.redFlags.map(f => `- ${f}`).join('\n') : '- None'}

Respond in JSON:
{
  "executiveSummary": "2-3 sentence executive summary with key numbers for the DG",
  "sections": [
    { "title": "Service Delivery Assessment", "severity": "critical|warning|stable|positive", "summary": "one-line with numbers", "detail": "full analysis paragraph" },
    { "title": "Geographic Equity Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of regional disparities" },
    { "title": "Community Impact", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of underserved communities" },
    { "title": "Capacity Planning", "severity": "warning|stable", "summary": "one-line", "detail": "resource allocation recommendations" }
  ],
  "recommendations": [
    { "category": "Operations|Staffing|Infrastructure|Policy", "recommendation": "specific action", "urgency": "Immediate|Short-term|Long-term" }
  ]
}`;

  try {
    const response = await getClient().messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('\n');
    const parsed = parseJSONResponse(text);

    return {
      success: true,
      executiveSummary: String(parsed.executiveSummary || ''),
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      usage: { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
