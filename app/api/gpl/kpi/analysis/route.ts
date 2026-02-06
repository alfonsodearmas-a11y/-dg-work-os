import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

// In-memory cache — invalidated when row count changes (new upload)
let cachedAnalysis: { analysis: any; generatedAt: number; rowCount: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    // Fetch all KPI data from Supabase
    const { data: kpiRows, error } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month, kpi_name, value')
      .order('report_month', { ascending: true });

    // Check cache — valid if TTL hasn't expired AND row count matches (no new uploads)
    const rowCount = kpiRows?.length ?? 0;
    if (
      cachedAnalysis &&
      Date.now() - cachedAnalysis.generatedAt < CACHE_TTL_MS &&
      cachedAnalysis.rowCount === rowCount
    ) {
      return NextResponse.json({
        success: true,
        hasAnalysis: true,
        analysis: cachedAnalysis.analysis,
        cached: true,
      });
    }

    if (error) throw error;

    if (!kpiRows || kpiRows.length === 0) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
        message: 'No KPI data available for analysis',
      });
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
        message: 'AI analysis not configured (missing API key)',
      });
    }

    // Group data by month for the prompt
    const byMonth: Record<string, Record<string, number>> = {};
    for (const row of kpiRows) {
      const month = String(row.report_month);
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][row.kpi_name] = parseFloat(row.value);
    }

    const months = Object.keys(byMonth).sort();
    const kpiNames = [...new Set(kpiRows.map(r => r.kpi_name))];
    const dateRangeStart = months[0];
    const dateRangeEnd = months[months.length - 1];

    // Build monthly data table for the prompt
    const dataLines = months.map(month => {
      const values = kpiNames.map(name => {
        const val = byMonth[month][name];
        return val !== undefined ? `${name}: ${val}` : null;
      }).filter(Boolean).join(', ');
      return `  ${month}: ${values}`;
    }).join('\n');

    const prompt = `You are the AI briefing system for the Ministry of Public Utilities in Guyana, analyzing monthly KPI trends for GPL (Guyana Power & Light).

## KPI Data (${months.length} months: ${dateRangeStart} to ${dateRangeEnd})

KPIs tracked: ${kpiNames.join(', ')}

Monthly values:
${dataLines}

## Your Analysis Task

Provide a concise executive briefing (3-4 paragraphs) analyzing these monthly KPI trends for the Director General. Focus on:
1. Overall trajectory — are things improving or declining?
2. Notable month-over-month changes or inflection points
3. Correlations between KPIs (e.g., demand vs losses, generation vs sales)
4. Actionable insights and areas of concern

Write in a professional, direct style suitable for an executive briefing. Use specific numbers from the data to support your points.

Respond in JSON format:
{
  "executive_briefing": "Your 3-4 paragraph analysis here"
}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n');

    // Parse JSON response
    let executiveBriefing: string;
    try {
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) jsonStr = objectMatch[0];
      const parsed = JSON.parse(jsonStr);
      executiveBriefing = parsed.executive_briefing || responseText.slice(0, 2000);
    } catch {
      executiveBriefing = responseText.slice(0, 2000);
    }

    const analysis = {
      executive_briefing: executiveBriefing,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      months_analyzed: months.length,
      kpis_tracked: kpiNames,
    };

    // Cache the result with row count for invalidation
    cachedAnalysis = { analysis, generatedAt: Date.now(), rowCount };

    return NextResponse.json({
      success: true,
      hasAnalysis: true,
      analysis,
    });
  } catch (error: any) {
    console.error('[gpl-kpi-analysis] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to generate KPI analysis' },
      { status: 500 }
    );
  }
}

// POST to force regeneration (invalidates cache)
export async function POST() {
  cachedAnalysis = null;
  // Re-use GET logic
  return GET();
}
