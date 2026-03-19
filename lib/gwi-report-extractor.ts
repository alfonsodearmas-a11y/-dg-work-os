/**
 * GWI Report Extractor
 *
 * Uses Claude Opus to extract structured data from raw report text.
 * One function per report type.
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseAIJson } from '@/lib/parse-utils';

const MODEL = 'claude-opus-4-6';
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

  return parseAIJson<Record<string, unknown>>(text);
}

/**
 * Extract financial data from a GWI Management Report
 */
export async function extractManagementReport(text: string): Promise<Record<string, unknown>> {
  const prompt = `You are a financial data extraction specialist for Guyana Water Inc (GWI).

IMPORTANT CONTEXT: GWI management reports often embed financial tables (income statement, balance sheet, cash flow) as images (EMF/Excel screenshots pasted into Word). The precise figures from these tables may NOT appear as structured data in the extracted text. You MUST look for values using ALL of these strategies:

1. **Explicit values in narrative text** — e.g., "Net Loss of $129.8 m", "Net Assets stood at G$93.4 b", "Cash at Bank was G$19.3 b"
2. **Compute from variances** — If the text says a value "decreased by $X or Y%" or "increased by $X or Y%" compared to budget, compute the actual value (see worked example below)
3. **Sum components** — If individual revenue/cost items are stated, sum them (e.g., total_revenue = tariff_revenue + other_operating_revenue + non_operating_revenue)
4. **Government subvention** — Look for "government subvention", "GoG subvention", "government warrant", "central government warrant", "subvention" in funding/government support sections

## ⚠ HIGH PRIORITY FIELDS
The following fields are the MOST IMPORTANT. Make EXTRA effort to extract or compute them — use every strategy above before giving up:
- **total_revenue** — Try explicit text first, then sum (tariff + other_operating + non_operating), then compute from variance
- **operating_cost** — Try explicit text first, then sum (employment + premises + supplies_services + transport + admin + depreciation), then compute from variance
- **govt_subvention** — Search ALL sections for "subvention", "GoG", "government warrant", "central government"

## GYD Currency Format Patterns
All monetary values must be returned as raw GYD numbers (no currency symbols, no commas, no abbreviations). Handle ALL of these formats found in GWI reports:

| Text in report | Numeric value |
|---|---|
| "$129.8 m" or "$129.8 million" | 129800000 |
| "G$19.3 b" or "G$19.3 billion" | 19300000000 |
| "$515,497,590" (raw with commas) | 515497590 |
| "$2,547,203,207" (billions with commas) | 2547203207 |
| "G$55.5 m" (with G$ prefix) | 55500000 |
| "($129.8 m)" (parenthesized = negative) | -129800000 |
| "($2,547,203,207)" (parenthesized with commas) | -2547203207 |
| "$0.8 m" or "$0.8 million" | 800000 |

Rules:
- "G$" and "$" both mean GYD in these reports — treat them identically
- Parentheses around a value mean NEGATIVE: "($X)" → -X
- "m" / "million" → multiply by 1,000,000
- "b" / "billion" → multiply by 1,000,000,000
- Strip all commas before converting

## Worked Example: Computing from Variance Text
Report text: "Total revenue showed a decrease of $152.3 m or 15.8% compared to budget of $963.3 m"
Step 1: Budget is stated as $963.3 m = 963,300,000
Step 2: Decrease = $152.3 m = 152,300,000
Step 3: Actual = Budget - Decrease = 963,300,000 - 152,300,000 = 811,000,000
→ total_revenue = 811000000, total_revenue_budget = 963300000

If only the percentage is given: "decreased by 15.8% compared to budget of $963.3 m"
Step 1: Budget = 963,300,000
Step 2: Actual = Budget × (1 - 0.158) = 963,300,000 × 0.842 = 811,098,600
→ total_revenue ≈ 811098600

If only the dollar decrease and percentage are given (no budget stated): "decreased by $152.3 m or 15.8%"
Step 1: Budget = 152,300,000 / 0.158 = 963,291,139
Step 2: Actual = 963,291,139 - 152,300,000 = 810,991,139
→ total_revenue ≈ 810991139

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

CRITICAL: Try hard to extract or compute every value. Only set a field to null as a last resort when the value truly cannot be determined from the text.
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

## CRITICAL: Data Source Priority
GWI's CSCR Board Report pastes most data tables as EMF/PNG IMAGES inside the Word document. These images are NOT extractable as text. However, nearly all key metrics ARE stated in the report's **prose paragraphs**. You MUST:
1. **PRIMARY: Extract from prose/narrative text** — scan every paragraph for the patterns below
2. **SECONDARY: Extract from any parseable tables** — some tables survive as actual Word XML tables

## GYD Currency Format Patterns
All monetary values must be returned as raw GYD numbers (no symbols, no commas):
- "$" and "G$" both mean GYD — treat identically
- "$515,497,590" → 515497590 | "$129.8 m" → 129800000 | "G$19.3 b" → 19300000000
- Parentheses mean negative: "($50.2 m)" → -50200000
- "m" / "million" → ×1,000,000 | "b" / "billion" → ×1,000,000,000

## Prose Extraction Patterns
These are the EXACT sentence patterns that appear in CSCR reports. Search for these:

**Collections:**
- "The Total Revenue collected in {MONTH} {YEAR} is \${AMOUNT}" → total_collections
- "The Regional Collections for {MONTH} {YEAR} amount to \${AMOUNT}" → regional_collections_total
- "Key Accounts Collection in {MONTH}{YEAR} is \${AMOUNT}" → key_accounts_collections
- "Total Regional Billings for {MONTH} {YEAR} amounted to \${AMOUNT}" → total_billings

**Billing & Accounts:**
- "{PERCENT}% of metered billings were based on actual readings" → billing_efficiency_pct
- "active accounts on the database as of {MONTH} {YEAR} was {COUNT}" → active_accounts
- "accounts receivable balance was \${AMOUNT}" → accounts_receivable
- "In {MONTH} {YEAR}, {PERCENT}% of the payments received were made on or before the due dates" → on_time_payment_pct

**Arrears:**
- "the debt for {YEAR} and prior was reduced by \${AMOUNT} or {PERCENT}%" → arrears_debt_reduction + arrears_debt_reduction_pct
- NOTE: 30/60/90-day arrears aging buckets are NOT reported in CSCR reports. Set those to null.

**Disconnections & Reconnections:**
- "{COUNT}, disconnections were done, and {RECONNECTED_IN_MONTH} or {PERCENT}% of those customers paid a total of \${AMOUNT} and were reconnected within the month and an additional {PRIOR_RECONNECTED} customers were reconnected from the previous months, bring the total reconnection to {TOTAL_RECONNECTIONS} and total payment of \${TOTAL_PAYMENT}"
  → disconnections, reconnections (use TOTAL_RECONNECTIONS), reconnection_payments (use TOTAL_PAYMENT)

**Customer Service:**
- "{COUNT}, complaints were received and logged into the Hi Affinity system. Of those, {RESOLVED} ({PERCENT}%) were resolved and {UNRESOLVED} ({PERCENT}%) were unresolved"
  → total_complaints, resolved_complaints, resolution_rate_pct, unresolved_complaints
- "{PERCENT}% or {COUNT} of all complaints were cleared within the stipulated timelines" → within_timeline_pct
- NOTE: Average resolution time in days is NOT reported. Set avg_resolution_days to null.

**PUC:**
- "There were {COUNT} PUC letters in {MONTH} {YEAR}" → puc_complaints
- Handle word-to-number: "two (2)" → 2, "one (1)" → 1

**Legal & Enforcement (DOLLAR VALUES, not counts):**
- "Issuance of Legal Correspondences\\t\\t\${AMOUNT}" → legal_actions_amount (this is a GYD dollar value)
- "Enforcement Officers\\t\\t\\t\\t\${AMOUNT}" → enforcement_actions_amount (this is a GYD dollar value)
- NOTE: These are dollar values of collections through legal/enforcement channels, NOT counts of actions.

**Regional Billings (from parseable Table 0 if available):**
If you find a table with regions (Region 2 through Region 10, Hinterland) and columns (Fixed Charge, Metered, Unmetered, Sewerage, Ancillary, TOTAL), extract the TOTAL column per region as region_X_billings.

Return a JSON object with exactly this structure:
{
  "collections": {
    "total_collections": number,
    "ytd_collections": number,
    "total_billings": number,
    "active_accounts": number,
    "accounts_receivable": number,
    "on_time_payment_pct": number,
    "regional_collections_total": number,
    "key_accounts_collections": number,
    "billing_efficiency_pct": number,
    "arrears_debt_reduction": number,
    "arrears_debt_reduction_pct": number,
    "arrears_30_days": number,
    "arrears_60_days": number,
    "arrears_90_plus_days": number,
    "region_2_billings": number,
    "region_3_billings": number,
    "region_4_billings": number,
    "region_5_billings": number,
    "region_6_billings": number,
    "region_7_billings": number,
    "region_8_billings": number,
    "region_9_billings": number,
    "region_10_billings": number,
    "hinterland_billings": number
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
    "legal_actions_amount": number,
    "enforcement_actions_amount": number,
    "puc_complaints": number,
    "puc_resolved": number
  }
}

If a value cannot be found in the text, set it to null.
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
