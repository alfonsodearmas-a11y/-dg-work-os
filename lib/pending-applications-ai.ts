import Anthropic from '@anthropic-ai/sdk';
import type { GPLAnalysis, GWIAnalysis, PendingApplication } from './pending-applications-types';

const CONFIG = {
  MODEL: 'claude-sonnet-4-5-20250929',
  MAX_TOKENS: 8192,
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

// ── CSV Data Generation ──────────────────────────────────────────────────────

function buildGPLCsv(records: PendingApplication[]): string {
  const header = 'Name,Customer#,PipelineStage,TownCity,DaysWaiting,ApplicationDate,AccountType,AccountStatus,Cycle';
  const rows = records.map(r =>
    [
      `${r.firstName} ${r.lastName}`.trim(),
      r.customerReference || '',
      r.pipelineStage || '',
      r.region || '',
      r.daysWaiting,
      r.applicationDate || '',
      r.accountType || '',
      r.accountStatus || '',
      r.cycle || '',
    ].map(v => String(v).includes(',') ? `"${v}"` : String(v)).join(',')
  );
  return [header, ...rows].join('\n');
}

function buildGWICsv(records: PendingApplication[]): string {
  const header = 'Name,CustomerRef,Region,District,VillageWard,DaysWaiting,ApplicationDate,Telephone';
  const rows = records.map(r =>
    [
      `${r.firstName} ${r.lastName}`.trim(),
      r.customerReference || '',
      r.region || '',
      r.district || '',
      r.villageWard || '',
      r.daysWaiting,
      r.applicationDate || '',
      r.telephone || '',
    ].map(v => String(v).includes(',') ? `"${v}"` : String(v)).join(',')
  );
  return [header, ...rows].join('\n');
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

  const csvData = buildGPLCsv(records);

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

## Full Dataset (CSV)
${csvData}

Analyze the FULL dataset above. Identify specific individuals, towns, and patterns. Be precise — cite actual names, locations, and numbers from the data.

Respond in JSON:
{
  "executiveSummary": "2-3 sentence executive summary with specific numbers for the DG — total count, worst bottleneck, longest waiting applicant by name",
  "sections": [
    { "title": "Pipeline Bottleneck Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line with specific numbers", "detail": "full analysis paragraph citing specific stages, counts, and the names of individuals waiting longest in each stage" },
    { "title": "SLA Compliance Assessment", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "full analysis with compliance rates per stage and names of worst-case applicants" },
    { "title": "Aging & Backlog Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of the oldest applications — name the individuals waiting 60+ days, 90+ days, 180+ days" },
    { "title": "Geographic Hotspots", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of which towns/cities have the most pending applications and longest waits" },
    { "title": "Revenue Impact", "severity": "warning|stable", "summary": "estimated connections delayed", "detail": "analysis of backlog cost — how many potential customers are being lost" }
  ],
  "recommendations": [
    { "category": "Operations|Staffing|Process|Policy", "recommendation": "specific actionable recommendation", "urgency": "Immediate|Short-term|Long-term" }
  ]
}`;

  try {
    const response = await getClient().messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
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

  const csvData = buildGWICsv(records);

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

## Full Dataset (CSV)
${csvData}

Analyze the FULL dataset above. Identify specific individuals, regions, districts, and villages. Be precise — cite actual names, locations, and numbers from the data.

Respond in JSON:
{
  "executiveSummary": "2-3 sentence executive summary with specific numbers for the DG — total count, worst region, longest waiting applicant by name",
  "sections": [
    { "title": "Service Delivery Assessment", "severity": "critical|warning|stable|positive", "summary": "one-line with specific numbers", "detail": "full analysis paragraph citing specific regions, counts, and names of individuals waiting longest" },
    { "title": "Geographic Equity Analysis", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of regional disparities — name specific regions and districts with disproportionate backlogs" },
    { "title": "Community Impact", "severity": "critical|warning|stable|positive", "summary": "one-line", "detail": "analysis of underserved communities — name specific villages with clusters of pending applications" },
    { "title": "Capacity Planning", "severity": "warning|stable", "summary": "one-line", "detail": "resource allocation recommendations based on geographic concentration of demand" }
  ],
  "recommendations": [
    { "category": "Operations|Staffing|Infrastructure|Policy", "recommendation": "specific actionable recommendation", "urgency": "Immediate|Short-term|Long-term" }
  ]
}`;

  try {
    const response = await getClient().messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
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
