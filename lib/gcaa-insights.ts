/**
 * GCAA AI Insights Service
 *
 * Generates comprehensive monthly analysis using Claude Opus.
 * Caches results in gcaa_ai_insights table.
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { supabaseAdmin } from './db';

// -- Types -------------------------------------------------------------------

interface GCAAMonthlyData {
  report_month: string;
  compliance_data: Record<string, unknown>;
  inspection_data: Record<string, unknown>;
  registration_data: Record<string, unknown>;
  incident_data: Record<string, unknown>;
}

interface InsightSection {
  headline: string;
  score: number; // 1-10
  severity: string; // critical | warning | stable | positive
  summary: string;
  key_metrics: string[];
  recommendations: string[];
}

export interface GCAAInsights {
  overall: {
    headline: string;
    health_score: number;
    severity: string;
    summary: string;
  };
  compliance: InsightSection;
  inspections: InsightSection;
  registrations: InsightSection;
  safety: InsightSection;
  cross_cutting: {
    issues: string[];
    opportunities: string[];
  };
  metadata: {
    report_month: string;
    generated_at: string;
    model: string;
    data_hash: string;
    processing_time_ms: number;
    months_analyzed: number;
  };
}

// -- Config ------------------------------------------------------------------

const AI_CONFIG = {
  MODEL: 'claude-opus-4-6',
  MAX_TOKENS: 8000,
  TEMPERATURE: 0.3,
} as const;

// -- Data Assembly -----------------------------------------------------------

/**
 * Fetch current + prior 2 months of GCAA data
 */
export async function assembleGCAAData(month: string): Promise<GCAAMonthlyData[]> {
  const { data, error } = await supabaseAdmin
    .from('gcaa_monthly_reports')
    .select('report_month, compliance_data, inspection_data, registration_data, incident_data')
    .lte('report_month', month)
    .order('report_month', { ascending: false })
    .limit(3);

  if (error) {
    console.error('[gcaa-insights] Failed to fetch monthly data:', error);
    return [];
  }

  return (data || []) as GCAAMonthlyData[];
}

/**
 * Create a hash of the data for cache invalidation
 */
function hashData(data: GCAAMonthlyData[]): string {
  const content = JSON.stringify(data);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// -- Prompt Builder ----------------------------------------------------------

function buildInsightsPrompt(data: GCAAMonthlyData[]): string {
  const current = data[0];
  const prior = data.slice(1);

  let dataText = `CURRENT MONTH (${current.report_month}):\n\n`;

  // Compliance
  dataText += 'COMPLIANCE DATA:\n';
  dataText += JSON.stringify(current.compliance_data, null, 2) + '\n\n';

  // Inspections
  dataText += 'INSPECTION DATA:\n';
  dataText += JSON.stringify(current.inspection_data, null, 2) + '\n\n';

  // Registrations
  dataText += 'REGISTRATION DATA:\n';
  dataText += JSON.stringify(current.registration_data, null, 2) + '\n\n';

  // Incidents
  dataText += 'INCIDENT & SAFETY DATA:\n';
  dataText += JSON.stringify(current.incident_data, null, 2) + '\n\n';

  // Prior months for trend analysis
  if (prior.length > 0) {
    dataText += '---\nPRIOR MONTHS (for trend comparison):\n\n';
    for (const p of prior) {
      dataText += `Month: ${p.report_month}\n`;
      dataText += `Compliance: ${JSON.stringify(p.compliance_data)}\n`;
      dataText += `Inspections: ${JSON.stringify(p.inspection_data)}\n`;
      dataText += `Registrations: ${JSON.stringify(p.registration_data)}\n`;
      dataText += `Incidents: ${JSON.stringify(p.incident_data)}\n\n`;
    }
  }

  return `You are a senior aviation regulatory analyst advising the Director General of Guyana's Ministry of Public Utilities and Aviation. You have deep expertise in civil aviation safety, regulatory compliance, aircraft registration, and aviation incident investigation.

Analyze the following GCAA (Guyana Civil Aviation Authority) monthly data and produce a comprehensive executive briefing.

${dataText}

Return a JSON object with exactly this structure:
\`\`\`json
{
  "overall": {
    "headline": "One-sentence executive summary of GCAA's current regulatory state",
    "health_score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence overview"
  },
  "compliance": {
    "headline": "Regulatory compliance headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence compliance summary with specific figures",
    "key_metrics": ["metric 1 with value", "metric 2 with value"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "inspections": {
    "headline": "Inspection activity headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence inspection summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "registrations": {
    "headline": "Aircraft/operator registration headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence registration summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "safety": {
    "headline": "Safety & incident headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence safety/incident summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "cross_cutting": {
    "issues": ["Cross-cutting issue 1 that spans multiple areas", "Issue 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"]
  }
}
\`\`\`

Be direct, specific, and use exact figures. This goes to the Director General for ministerial decisions. Flag any concerning trends between months. Highlight any safety incidents or compliance lapses that require immediate attention.`;
}

// -- Main Functions ----------------------------------------------------------

/**
 * Generate GCAA insights for a given month.
 * Uses cache unless forceRegenerate is true or data has changed.
 */
export async function generateGCAAInsights(
  month: string,
  forceRegenerate = false
): Promise<GCAAInsights | null> {
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[gcaa-insights] ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Assemble data
  const data = await assembleGCAAData(month);
  if (data.length === 0) {
    console.warn('[gcaa-insights] No data found for month:', month);
    return null;
  }

  const dataHash = hashData(data);

  // Check cache
  if (!forceRegenerate) {
    const { data: cached } = await supabaseAdmin
      .from('gcaa_ai_insights')
      .select('insight_json, data_hash')
      .eq('report_month', month)
      .eq('insight_type', 'monthly_analysis')
      .single();

    if (cached && cached.data_hash === dataHash) {
      console.log('[gcaa-insights] Returning cached insights for', month);
      return cached.insight_json as unknown as GCAAInsights;
    }
  }

  // Generate new insights with Claude Opus
  console.log('[gcaa-insights] Generating new insights for', month);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = buildInsightsPrompt(data);

    const response = await client.messages.create({
      model: AI_CONFIG.MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      temperature: AI_CONFIG.TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    const processingTime = Date.now() - startTime;

    const insights: GCAAInsights = {
      ...parsed,
      metadata: {
        report_month: month,
        generated_at: new Date().toISOString(),
        model: AI_CONFIG.MODEL,
        data_hash: dataHash,
        processing_time_ms: processingTime,
        months_analyzed: data.length,
      },
    };

    // Upsert into cache
    const { error: upsertError } = await supabaseAdmin
      .from('gcaa_ai_insights')
      .upsert(
        {
          report_month: month,
          insight_type: 'monthly_analysis',
          insight_json: insights as unknown as Record<string, unknown>,
          model_used: AI_CONFIG.MODEL,
          data_hash: dataHash,
        },
        { onConflict: 'report_month,insight_type' }
      );

    if (upsertError) {
      console.error('[gcaa-insights] Failed to cache insights:', upsertError);
    }

    console.log(`[gcaa-insights] Insights generated in ${processingTime}ms`);
    return insights;
  } catch (err) {
    console.error('[gcaa-insights] Error generating insights:', err);
    return null;
  }
}

/**
 * Get latest cached insights (any month)
 */
export async function getLatestGCAAInsights(): Promise<GCAAInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('gcaa_ai_insights')
    .select('insight_json')
    .eq('insight_type', 'monthly_analysis')
    .order('report_month', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as GCAAInsights;
}

/**
 * Get insights for a specific month
 */
export async function getGCAAInsightsForMonth(month: string): Promise<GCAAInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('gcaa_ai_insights')
    .select('insight_json')
    .eq('report_month', month)
    .eq('insight_type', 'monthly_analysis')
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as GCAAInsights;
}
