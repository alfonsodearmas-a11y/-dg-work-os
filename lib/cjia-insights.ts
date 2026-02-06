/**
 * CJIA AI Insights Service
 *
 * Generates comprehensive monthly analysis using Claude Opus.
 * Caches results in cjia_ai_insights table.
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { supabaseAdmin } from './db';

// ── Types ───────────────────────────────────────────────────────────────────

interface CJIAMonthlyData {
  report_month: string;
  operations_data: Record<string, unknown>;
  passenger_data: Record<string, unknown>;
  revenue_data: Record<string, unknown>;
  project_data: Record<string, unknown>;
}

interface InsightSection {
  headline: string;
  score: number; // 1-10
  severity: string; // critical | warning | stable | positive
  summary: string;
  key_metrics: string[];
  recommendations: string[];
}

export interface CJIAInsights {
  overall: {
    headline: string;
    health_score: number;
    severity: string;
    summary: string;
  };
  operations: InsightSection;
  passengers: InsightSection;
  revenue: InsightSection;
  projects: InsightSection;
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

// ── Config ──────────────────────────────────────────────────────────────────

const AI_CONFIG = {
  MODEL: 'claude-opus-4-6',
  MAX_TOKENS: 8000,
  TEMPERATURE: 0.3,
} as const;

// ── Data Assembly ───────────────────────────────────────────────────────────

/**
 * Fetch current + prior 2 months of CJIA data
 */
export async function assembleCJIAData(month: string): Promise<CJIAMonthlyData[]> {
  const { data, error } = await supabaseAdmin
    .from('cjia_monthly_reports')
    .select('report_month, operations_data, passenger_data, revenue_data, project_data')
    .lte('report_month', month)
    .order('report_month', { ascending: false })
    .limit(3);

  if (error) {
    console.error('[cjia-insights] Failed to fetch monthly data:', error);
    return [];
  }

  return (data || []) as CJIAMonthlyData[];
}

/**
 * Create a hash of the data for cache invalidation
 */
function hashData(data: CJIAMonthlyData[]): string {
  const content = JSON.stringify(data);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ── Prompt Builder ──────────────────────────────────────────────────────────

function buildInsightsPrompt(data: CJIAMonthlyData[]): string {
  const current = data[0];
  const prior = data.slice(1);

  let dataText = `CURRENT MONTH (${current.report_month}):\n\n`;

  // Operations
  dataText += 'OPERATIONS DATA:\n';
  dataText += JSON.stringify(current.operations_data, null, 2) + '\n\n';

  // Passengers
  dataText += 'PASSENGER DATA:\n';
  dataText += JSON.stringify(current.passenger_data, null, 2) + '\n\n';

  // Revenue
  dataText += 'REVENUE DATA:\n';
  dataText += JSON.stringify(current.revenue_data, null, 2) + '\n\n';

  // Projects
  dataText += 'PROJECT DATA:\n';
  dataText += JSON.stringify(current.project_data, null, 2) + '\n\n';

  // Prior months for trend analysis
  if (prior.length > 0) {
    dataText += '---\nPRIOR MONTHS (for trend comparison):\n\n';
    for (const p of prior) {
      dataText += `Month: ${p.report_month}\n`;
      dataText += `Operations: ${JSON.stringify(p.operations_data)}\n`;
      dataText += `Passengers: ${JSON.stringify(p.passenger_data)}\n`;
      dataText += `Revenue: ${JSON.stringify(p.revenue_data)}\n`;
      dataText += `Projects: ${JSON.stringify(p.project_data)}\n\n`;
    }
  }

  return `You are a senior aviation analyst advising the Director General of Guyana's Ministry of Public Utilities and Aviation. You have deep expertise in airport operations, passenger analytics, aviation revenue management, and infrastructure projects.

Analyze the following CJIA (Cheddi Jagan International Airport) monthly data and produce a comprehensive executive briefing.

${dataText}

All monetary values are in GYD (Guyanese dollars) unless otherwise noted. Format large numbers as millions (M) or billions (B) in your analysis.

Return a JSON object with exactly this structure:
\`\`\`json
{
  "overall": {
    "headline": "One-sentence executive summary of CJIA's current state",
    "health_score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence overview"
  },
  "operations": {
    "headline": "Airport operations headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence operations summary with specific figures",
    "key_metrics": ["metric 1 with value", "metric 2 with value"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "passengers": {
    "headline": "Passenger traffic headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence passenger analytics summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "revenue": {
    "headline": "Revenue performance headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence revenue summary with specific GYD figures",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "projects": {
    "headline": "Infrastructure projects headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence project status summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "cross_cutting": {
    "issues": ["Cross-cutting issue 1 that spans multiple areas", "Issue 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"]
  }
}
\`\`\`

Be direct, specific, and use exact figures. This goes to the Director General for ministerial decisions. Flag any concerning trends between months.`;
}

// ── Main Functions ──────────────────────────────────────────────────────────

/**
 * Generate CJIA insights for a given month.
 * Uses cache unless forceRegenerate is true or data has changed.
 */
export async function generateCJIAInsights(
  month: string,
  forceRegenerate = false
): Promise<CJIAInsights | null> {
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[cjia-insights] ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Assemble data
  const data = await assembleCJIAData(month);
  if (data.length === 0) {
    console.warn('[cjia-insights] No data found for month:', month);
    return null;
  }

  const dataHash = hashData(data);

  // Check cache
  if (!forceRegenerate) {
    const { data: cached } = await supabaseAdmin
      .from('cjia_ai_insights')
      .select('insight_json, data_hash')
      .eq('report_month', month)
      .eq('insight_type', 'monthly_analysis')
      .single();

    if (cached && cached.data_hash === dataHash) {
      console.log('[cjia-insights] Returning cached insights for', month);
      return cached.insight_json as unknown as CJIAInsights;
    }
  }

  // Generate new insights with Claude Opus
  console.log('[cjia-insights] Generating new insights for', month);

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

    const insights: CJIAInsights = {
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
      .from('cjia_ai_insights')
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
      console.error('[cjia-insights] Failed to cache insights:', upsertError);
    }

    console.log(`[cjia-insights] Insights generated in ${processingTime}ms`);
    return insights;
  } catch (err) {
    console.error('[cjia-insights] Error generating insights:', err);
    return null;
  }
}

/**
 * Get latest cached insights (any month)
 */
export async function getLatestCJIAInsights(): Promise<CJIAInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('cjia_ai_insights')
    .select('insight_json')
    .eq('insight_type', 'monthly_analysis')
    .order('report_month', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as CJIAInsights;
}

/**
 * Get insights for a specific month
 */
export async function getCJIAInsightsForMonth(month: string): Promise<CJIAInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('cjia_ai_insights')
    .select('insight_json')
    .eq('report_month', month)
    .eq('insight_type', 'monthly_analysis')
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as CJIAInsights;
}
