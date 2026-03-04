// Service Connection AI Analysis
// Claude-powered efficiency analysis for service connections.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { EfficiencyMetrics, ServiceConnection, AIInsight } from './service-connection-types';

const MODEL = 'claude-opus-4-6-20250929';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.3;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function buildCSV(connections: ServiceConnection[]): string {
  const headers = ['Name', 'CustomerRef', 'ServiceOrder', 'Track', 'Stage', 'Region', 'Status', 'DaysToComplete', 'ApplicationDate', 'AccountType'];
  const rows = connections.slice(0, 500).map(c => [
    `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    c.customer_reference || '',
    c.service_order_number || '',
    c.track,
    c.current_stage || '',
    c.region || '',
    c.status,
    c.total_days_to_complete?.toString() || '',
    c.application_date || '',
    c.account_type || '',
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

function buildPrompt(metrics: EfficiencyMetrics, connections: ServiceConnection[]): string {
  const csv = buildCSV(connections);

  const overallText = `Overall: ${metrics.overall.completedCount} completed, avg ${metrics.overall.avgDays} days, median ${metrics.overall.medianDays} days, SLA compliance ${metrics.overall.slaPct}%, ${metrics.totalOpen} still open`;

  const trackAText = `Track A (fast-track): ${metrics.trackA.completedCount} completed, avg ${metrics.trackA.avgDays} days (target ≤${metrics.trackA.slaTarget}d), SLA ${metrics.trackA.slaPct}%`;
  const trackBText = `Track B (capital work): ${metrics.trackB.completedCount} completed, avg ${metrics.trackB.avgDays} days (target ≤${metrics.trackB.slaTarget}d), SLA ${metrics.trackB.slaPct}%`;

  const stageText = metrics.stages.map(s =>
    `  ${s.stage}: ${s.count} orders, avg ${s.avgDays}d, median ${s.medianDays}d, max ${s.maxDays}d, SLA target ${s.slaTarget}d → ${s.slaPct}% compliance`
  ).join('\n');

  const regionText = metrics.regions.slice(0, 10).map(r =>
    `  ${r.region}: ${r.openCount} open, ${r.completedCount} completed, avg ${r.avgDays}d`
  ).join('\n');

  const monthlyText = metrics.monthly.slice(-6).map(m =>
    `  ${m.month}: +${m.opened} opened, -${m.completed} completed, queue ${m.queueDepth}, avg ${m.avgDaysToComplete ?? 'N/A'}d`
  ).join('\n');

  return `You are an energy sector regulatory analyst advising the Director General of the Ministry of Public Utilities (Guyana) on GPL's service connection efficiency.

CONTEXT:
GPL handles new electricity service connections through a regulated pipeline. The PUC monitors connection times. Track A is fast-track (simple meter installation, target ≤10 business days). Track B requires capital work (network extension + meter, involving Design, Execution, and Metering stages).

EFFICIENCY SUMMARY:
${overallText}
${trackAText}
${trackBText}
Legacy excluded: ${metrics.totalLegacy} (pre-2015 applications)

STAGE BREAKDOWN (Track B pipeline):
${stageText}

REGIONAL DISTRIBUTION:
${regionText}

RECENT MONTHLY VOLUMES:
${monthlyText}

FULL DATASET (up to 500 records):
${csv}

Analyze this data and return a JSON object with this exact structure:
{
  "executiveSummary": "2-3 sentences with specific numbers. Mention the longest waiting customer by name if identifiable.",
  "sections": [
    {
      "title": "Completion Efficiency|Pipeline Bottleneck Analysis|SLA Compliance Assessment|Regional Disparities|Throughput Trends",
      "severity": "critical|warning|stable|positive",
      "summary": "one-line summary",
      "detail": "paragraph citing specific names, numbers, and regions"
    }
  ],
  "recommendations": [
    {
      "category": "Operations|Staffing|Process|Policy",
      "recommendation": "specific actionable recommendation",
      "urgency": "Immediate|Short-term|Long-term"
    }
  ]
}

Include 4-5 sections and 3-5 recommendations. Be specific and cite actual numbers from the data. Focus on actionable insights for the DG.`;
}

function parseJSONResponse(text: string): AIInsight | null {
  // Try raw JSON first
  try {
    return JSON.parse(text);
  } catch {
    // noop
  }
  // Try extracting from markdown code block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {
      // noop
    }
  }
  return null;
}

/** Generate AI analysis of service connection efficiency */
export async function generateEfficiencyAnalysis(
  metrics: EfficiencyMetrics,
  connections: ServiceConnection[]
): Promise<AIInsight> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(metrics, connections);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const parsed = parseJSONResponse(text);
  if (!parsed) {
    throw new Error('Failed to parse AI response as JSON');
  }

  return parsed;
}

/** Get cached AI analysis or null */
export async function getCachedAnalysis(): Promise<AIInsight | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('service_connection_ai_insights')
    .select('result')
    .eq('analysis_type', 'efficiency')
    .eq('status', 'completed')
    .order('analysis_date', { ascending: false })
    .limit(1)
    .single();

  return data?.result as AIInsight | null;
}

/** Save AI analysis to cache */
export async function saveAnalysis(insight: AIInsight): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('service_connection_ai_insights')
    .insert({
      analysis_type: 'efficiency',
      result: insight,
      status: 'completed',
    });
}
