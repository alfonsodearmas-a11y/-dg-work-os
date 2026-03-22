/**
 * GWI AI Insights Service
 *
 * Caches results in gwi_ai_insights table.
 */

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { supabaseAdmin } from './db';
import { logger } from '@/lib/logger';
import { parseAIJson } from '@/lib/parse-utils';
import { groupAndMerge, GWI_REPORT_COLUMNS } from '@/lib/gwi-report-merge';
import { AI_MODEL_OPUS } from '@/lib/constants/ai-config';

// ── Types ───────────────────────────────────────────────────────────────────

interface GWIMonthlyData {
  id: string;
  report_month: string;
  financial_data: Record<string, unknown>;
  collections_data: Record<string, unknown>;
  customer_service_data: Record<string, unknown>;
  procurement_data: Record<string, unknown>;
  created_at: string;
}

interface InsightSection {
  headline: string;
  score: number; // 1-10
  severity: string; // critical | warning | stable | positive
  summary: string;
  key_metrics: string[];
  recommendations: string[];
}

export interface GWIInsights {
  overall: {
    headline: string;
    health_score: number;
    severity: string;
    summary: string;
  };
  financial: InsightSection;
  operational: InsightSection;
  customer_service: InsightSection;
  procurement: InsightSection;
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
  MODEL: AI_MODEL_OPUS,
  MAX_TOKENS: 8000,
  TEMPERATURE: 0.3,
} as const;

// ── Data Assembly ───────────────────────────────────────────────────────────

/**
 * Fetch current + prior 2 months of GWI data.
 * Merges management/cscr/procurement rows per month so each entry
 * has the complete financial picture.
 */
export async function assembleGWIData(month: string): Promise<GWIMonthlyData[]> {
  // Fetch enough rows to cover 3 months × 3 report types
  const { data, error } = await supabaseAdmin
    .from('gwi_monthly_reports')
    .select(GWI_REPORT_COLUMNS)
    .lte('report_month', month)
    .order('report_month', { ascending: false })
    .limit(9);

  if (error) {
    logger.error({ err: error }, 'gwi-insights: failed to fetch monthly data');
    return [];
  }

  // Merge report types per month and take the 3 most recent months
  const merged = groupAndMerge(data || []);
  return merged.slice(0, 3);
}

/**
 * Create a hash of the data for cache invalidation
 */
function hashData(data: GWIMonthlyData[]): string {
  const content = JSON.stringify(data);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ── Prompt Builder ──────────────────────────────────────────────────────────

function buildInsightsPrompt(data: GWIMonthlyData[]): string {
  const current = data[0];
  const prior = data.slice(1);

  let dataText = `CURRENT MONTH (${current.report_month}):\n\n`;

  // Financial
  dataText += 'FINANCIAL DATA:\n';
  dataText += JSON.stringify(current.financial_data, null, 2) + '\n\n';

  // Collections
  dataText += 'COLLECTIONS & BILLING DATA:\n';
  dataText += JSON.stringify(current.collections_data, null, 2) + '\n\n';

  // Customer Service
  dataText += 'CUSTOMER SERVICE DATA:\n';
  dataText += JSON.stringify(current.customer_service_data, null, 2) + '\n\n';

  // Procurement
  dataText += 'PROCUREMENT DATA:\n';
  dataText += JSON.stringify(current.procurement_data, null, 2) + '\n\n';

  // Prior months for trend analysis
  if (prior.length > 0) {
    dataText += '---\nPRIOR MONTHS (for trend comparison):\n\n';
    for (const p of prior) {
      dataText += `Month: ${p.report_month}\n`;
      dataText += `Financial: ${JSON.stringify(p.financial_data)}\n`;
      dataText += `Collections: ${JSON.stringify(p.collections_data)}\n`;
      dataText += `Customer Service: ${JSON.stringify(p.customer_service_data)}\n`;
      dataText += `Procurement: ${JSON.stringify(p.procurement_data)}\n\n`;
    }
  }

  return `You are a senior utility analyst advising the Director General of Guyana's Ministry of Public Utilities and Aviation. You have deep expertise in water utility operations, public finance, and infrastructure management.

## CRITICAL CONTEXT — Subsidized Public Utility Model
GWI (Guyana Water Incorporated) is a STATE-OWNED public water utility that operates under a **subsidized model**. This means:
- GWI does NOT generate sufficient tariff revenue to cover operating costs. This is BY DESIGN — water tariffs are kept affordable as public policy.
- The Government of Guyana bridges the funding gap through **subventions (warrants)**. Net losses are STRUCTURAL and EXPECTED.
- Net losses do NOT indicate "financial distress" or "crisis" — they indicate the normal operating model of a subsidized utility. Do NOT use alarmist language like "catastrophic", "severe distress", "unsustainable losses", etc.
- Budget variances (actual vs. budget) ARE meaningful and should be noted, but frame them as "budget variance" not "financial crisis".

## What Matters for GWI's Health
Weight your analysis and health_score toward these OPERATIONAL indicators (in order of importance):
1. **Collections efficiency** — Are customers paying? What's the collection rate vs. billings?
2. **Billing accuracy** — % of actual meter readings vs. estimated bills
3. **Accounts receivable trends** — Is the A/R balance growing or shrinking month-over-month?
4. **Customer service** — Complaint resolution rate, response times, PUC complaints
5. **Non-revenue water (NRW)** — System losses (if data available)
6. **Procurement execution** — Contract completion, inventory management
7. **Cash position adequacy** — Is cash at bank sufficient for near-term operations?
8. **Budget discipline** — Revenue and cost variances against budget (note them, don't catastrophize)

## Data
${dataText}

All monetary values are in GYD (Guyanese dollars). Format large numbers as millions (M) or billions (B) in your analysis.

Return a JSON object with exactly this structure:
\`\`\`json
{
  "overall": {
    "headline": "One-sentence executive summary focused on operational performance, NOT profit/loss",
    "health_score": <number 1-10, weighted toward operational delivery not profitability>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence overview. Lead with operational performance. Mention budget variances factually without alarmism."
  },
  "financial": {
    "headline": "Budget performance headline (NOT 'financial distress')",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentences. Note revenue/cost variances vs budget. Mention subvention. Do NOT frame net loss as crisis.",
    "key_metrics": ["metric 1 with value", "metric 2 with value"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "operational": {
    "headline": "Collections & billing headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence collections/billing summary with specific figures",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "customer_service": {
    "headline": "Customer service headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence customer service summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "procurement": {
    "headline": "Procurement headline",
    "score": <number 1-10>,
    "severity": "<critical|warning|stable|positive>",
    "summary": "2-3 sentence procurement summary",
    "key_metrics": ["metric 1", "metric 2"],
    "recommendations": ["recommendation 1"]
  },
  "cross_cutting": {
    "issues": ["Cross-cutting issue 1 that spans multiple areas", "Issue 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"]
  }
}
\`\`\`

Be direct, specific, and use exact figures. This goes to the Director General for ministerial decisions. Flag genuinely concerning operational trends between months. Be concise and Board-ready — no filler, no alarmism.`;
}

// ── Main Functions ──────────────────────────────────────────────────────────

/**
 * Generate GWI insights for a given month.
 * Uses cache unless forceRegenerate is true or data has changed.
 */
export async function generateGWIInsights(
  month: string,
  forceRegenerate = false
): Promise<GWIInsights | null> {
  const startTime = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[gwi-insights] ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Assemble data
  const data = await assembleGWIData(month);
  if (data.length === 0) {
    console.warn('[gwi-insights] No data found for month:', month);
    return null;
  }

  const dataHash = hashData(data);

  // Check cache
  if (!forceRegenerate) {
    const { data: cached } = await supabaseAdmin
      .from('gwi_ai_insights')
      .select('insight_json, data_hash')
      .eq('report_month', month)
      .eq('insight_type', 'monthly_analysis')
      .single();

    if (cached && cached.data_hash === dataHash) {
      console.log('[gwi-insights] Returning cached insights for', month);
      return cached.insight_json as unknown as GWIInsights;
    }
  }

  // Generate new insights with Claude Opus
  console.log('[gwi-insights] Generating new insights for', month);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = buildInsightsPrompt(data);

    const response = await client.messages.create({
      model: AI_CONFIG.MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parseAIJson<any>(text);

    const processingTime = Date.now() - startTime;

    const insights: GWIInsights = {
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
      .from('gwi_ai_insights')
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
      logger.error({ err: upsertError }, 'gwi-insights: failed to cache insights');
    }

    console.log(`[gwi-insights] Insights generated in ${processingTime}ms`);
    return insights;
  } catch (err) {
    logger.error({ err }, 'gwi-insights: error generating insights');
    return null;
  }
}

/**
 * Get latest cached insights (any month)
 */
export async function getLatestGWIInsights(): Promise<GWIInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('gwi_ai_insights')
    .select('insight_json')
    .eq('insight_type', 'monthly_analysis')
    .order('report_month', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as GWIInsights;
}

/**
 * Get insights for a specific month
 */
export async function getGWIInsightsForMonth(month: string): Promise<GWIInsights | null> {
  const { data, error } = await supabaseAdmin
    .from('gwi_ai_insights')
    .select('insight_json')
    .eq('report_month', month)
    .eq('insight_type', 'monthly_analysis')
    .single();

  if (error || !data) return null;
  return data.insight_json as unknown as GWIInsights;
}
