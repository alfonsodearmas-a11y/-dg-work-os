/**
 * GWI Report Extractor
 *
 * Uses Claude Sonnet to extract structured data from raw report text.
 * One function per report type.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.2;

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function callClaude(systemPrompt: string, userContent: string): Promise<Record<string, unknown>> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      {
        role: 'user',
        content: `${systemPrompt}\n\n---\n\nHere is the report text:\n\n${userContent}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Extract JSON from response (may be wrapped in ```json blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON');
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonStr);
}

/**
 * Extract financial data from a GWI Management Report
 */
export async function extractManagementReport(text: string): Promise<Record<string, unknown>> {
  const prompt = `You are a financial data extraction specialist for Guyana Water Inc (GWI).
Extract the following financial metrics from the management report text. All monetary values should be in GYD (Guyanese dollars) as raw numbers (not formatted).

Return a JSON object with these exact keys:
{
  "net_profit": number,
  "net_profit_budget": number,
  "net_profit_variance_pct": number,
  "total_revenue": number,
  "total_revenue_budget": number,
  "tariff_revenue": number,
  "other_operating_revenue": number,
  "non_operating_revenue": number,
  "operating_cost": number,
  "operating_cost_budget": number,
  "employment_cost": number,
  "premises_cost": number,
  "supplies_services": number,
  "transport_cost": number,
  "admin_cost": number,
  "depreciation": number,
  "govt_subvention": number,
  "cash_at_bank": number,
  "net_assets": number,
  "property_equipment": number,
  "work_in_progress": number,
  "current_assets": number,
  "current_liabilities": number,
  "trade_payables": number,
  "gpl_liability": number
}

If a value cannot be found, set it to null.
Return ONLY the JSON object, wrapped in \`\`\`json code blocks.`;

  return callClaude(prompt, text);
}

/**
 * Extract collections + customer service data from a CSCR Board Report
 */
export async function extractCSCRReport(text: string): Promise<{
  collections: Record<string, unknown>;
  customerService: Record<string, unknown>;
}> {
  const prompt = `You are a data extraction specialist for Guyana Water Inc (GWI).
Extract collections/billing and customer service metrics from this CSCR Board Report.
All monetary values should be in GYD as raw numbers.

Return a JSON object with exactly this structure:
{
  "collections": {
    "total_collections": number,
    "ytd_collections": number,
    "total_billings": number,
    "active_accounts": number,
    "accounts_receivable": number,
    "on_time_payment_pct": number,
    "region_1_collections": number,
    "region_2_collections": number,
    "region_3_collections": number,
    "region_4_collections": number,
    "region_5_collections": number,
    "billing_efficiency_pct": number,
    "arrears_30_days": number,
    "arrears_60_days": number,
    "arrears_90_plus_days": number
  },
  "customerService": {
    "total_complaints": number,
    "resolved_complaints": number,
    "resolution_rate_pct": number,
    "within_timeline_pct": number,
    "unresolved_complaints": number,
    "avg_resolution_days": number,
    "disconnections": number,
    "reconnections": number,
    "reconnection_payments": number,
    "legal_actions": number,
    "enforcement_actions": number,
    "puc_complaints": number,
    "puc_resolved": number
  }
}

If a value cannot be found, set it to null.
Return ONLY the JSON object, wrapped in \`\`\`json code blocks.`;

  const result = await callClaude(prompt, text);
  return result as { collections: Record<string, unknown>; customerService: Record<string, unknown> };
}

/**
 * Extract procurement data from a GWI Procurement Report
 */
export async function extractProcurementReport(text: string): Promise<Record<string, unknown>> {
  const prompt = `You are a procurement data extraction specialist for Guyana Water Inc (GWI).
Extract procurement metrics from this report. All monetary values should be in GYD as raw numbers.

Return a JSON object with these exact keys:
{
  "total_purchases": number,
  "gog_funded": number,
  "gog_funded_pct": number,
  "gwi_funded": number,
  "gwi_funded_pct": number,
  "major_contracts_count": number,
  "major_contracts_value": number,
  "minor_contracts_count": number,
  "minor_contracts_value": number,
  "inventory_value": number,
  "inventory_receipts": number,
  "inventory_issues": number,
  "major_contracts_by_type": {
    "infrastructure": {"count": number, "value": number},
    "equipment": {"count": number, "value": number},
    "services": {"count": number, "value": number},
    "other": {"count": number, "value": number}
  },
  "minor_contracts_by_type": {
    "maintenance": {"count": number, "value": number},
    "supplies": {"count": number, "value": number},
    "services": {"count": number, "value": number}
  }
}

If a value cannot be found, set it to null.
Return ONLY the JSON object, wrapped in \`\`\`json code blocks.`;

  return callClaude(prompt, text);
}
