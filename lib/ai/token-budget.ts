import { supabaseAdmin } from '@/lib/db';
import { ModelTier, TokenBudgetStatus } from './types';

// ── Budget Configuration ────────────────────────────────────────────────────

// Daily budget in "Opus-equivalent tokens" (weighted by cost ratio)
// Opus: ~$75/M input, $150/M output → weight 1.0
// Sonnet: ~$3/M input, $15/M output → weight ~0.1
// Haiku: ~$0.80/M input, $4/M output → weight ~0.03
const COST_WEIGHTS: Record<ModelTier, number> = {
  opus: 1.0,
  sonnet: 0.1,
  haiku: 0.03,
};

// Budget = ~$5/day worth of Opus tokens ≈ 33K output tokens equivalent
const DAILY_BUDGET = 33_000;

// Threshold actions
const WARN_80_PCT = 0.80;
const WARN_95_PCT = 0.95;

// ── Get Budget Status ───────────────────────────────────────────────────────

export async function getTokenBudgetStatus(): Promise<TokenBudgetStatus> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: rows } = await supabaseAdmin
      .from('ai_usage_log')
      .select('model_tier, input_tokens, output_tokens')
      .gte('created_at', todayStart.toISOString());

    let weightedTotal = 0;
    for (const row of rows || []) {
      const weight = COST_WEIGHTS[row.model_tier as ModelTier] || 1.0;
      weightedTotal += (row.input_tokens + row.output_tokens) * weight;
    }

    const pct = Math.min(100, (weightedTotal / DAILY_BUDGET) * 100);

    let tierCap: ModelTier = 'opus';
    let warning: string | null = null;

    if (pct >= 100) {
      tierCap = 'haiku';
      warning = 'Daily AI budget exhausted. Using Quick mode only.';
    } else if (pct >= WARN_95_PCT * 100) {
      tierCap = 'haiku';
      warning = 'AI budget nearly exhausted (95%). Switching to Quick mode.';
    } else if (pct >= WARN_80_PCT * 100) {
      tierCap = 'sonnet';
      warning = 'AI budget at 80%. Deep analysis temporarily limited.';
    }

    return {
      used_today: Math.round(weightedTotal),
      daily_limit: DAILY_BUDGET,
      pct: Math.round(pct),
      tier_cap: tierCap,
      warning,
    };
  } catch (err) {
    console.error('[ai/budget] Error fetching budget:', err);
    // Fail open — allow all tiers
    return {
      used_today: 0,
      daily_limit: DAILY_BUDGET,
      pct: 0,
      tier_cap: 'opus',
      warning: null,
    };
  }
}

// ── Log Usage ───────────────────────────────────────────────────────────────

export async function logUsage(
  sessionId: string,
  tier: ModelTier,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  queryType: string,
  currentPage: string,
  cached: boolean,
  localAnswer: boolean,
): Promise<void> {
  try {
    await supabaseAdmin.from('ai_usage_log').insert({
      session_id: sessionId,
      model_tier: tier,
      model_id: modelId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      query_type: queryType,
      current_page: currentPage,
      cached,
      local_answer: localAnswer,
    });
  } catch (err) {
    console.error('[ai/budget] Log error:', err);
  }
}

// ── Get Usage Stats (for admin) ─────────────────────────────────────────────

export async function getUsageStats(days = 7): Promise<{
  daily: Array<{
    date: string;
    haiku_tokens: number;
    sonnet_tokens: number;
    opus_tokens: number;
    cached_count: number;
    local_count: number;
    total_requests: number;
  }>;
  totals: {
    total_tokens: number;
    total_requests: number;
    cached_pct: number;
    local_pct: number;
    by_tier: Record<ModelTier, number>;
  };
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: rows } = await supabaseAdmin
      .from('ai_usage_log')
      .select('model_tier, input_tokens, output_tokens, cached, local_answer, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (!rows || rows.length === 0) {
      return {
        daily: [],
        totals: { total_tokens: 0, total_requests: 0, cached_pct: 0, local_pct: 0, by_tier: { haiku: 0, sonnet: 0, opus: 0 } },
      };
    }

    // Group by date
    const byDate: Record<string, {
      haiku: number; sonnet: number; opus: number;
      cached: number; local: number; total: number;
    }> = {};

    let totalTokens = 0;
    let cachedCount = 0;
    let localCount = 0;
    const byTier: Record<ModelTier, number> = { haiku: 0, sonnet: 0, opus: 0 };

    for (const row of rows) {
      const date = row.created_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = { haiku: 0, sonnet: 0, opus: 0, cached: 0, local: 0, total: 0 };

      const tokens = (row.input_tokens || 0) + (row.output_tokens || 0);
      const tier = row.model_tier as ModelTier;

      byDate[date][tier] += tokens;
      byDate[date].total++;
      if (row.cached) byDate[date].cached++;
      if (row.local_answer) byDate[date].local++;

      totalTokens += tokens;
      byTier[tier] += tokens;
      if (row.cached) cachedCount++;
      if (row.local_answer) localCount++;
    }

    const daily = Object.entries(byDate).map(([date, d]) => ({
      date,
      haiku_tokens: d.haiku,
      sonnet_tokens: d.sonnet,
      opus_tokens: d.opus,
      cached_count: d.cached,
      local_count: d.local,
      total_requests: d.total,
    }));

    return {
      daily,
      totals: {
        total_tokens: totalTokens,
        total_requests: rows.length,
        cached_pct: rows.length > 0 ? Math.round((cachedCount / rows.length) * 100) : 0,
        local_pct: rows.length > 0 ? Math.round((localCount / rows.length) * 100) : 0,
        by_tier: byTier,
      },
    };
  } catch (err) {
    console.error('[ai/budget] Stats error:', err);
    return {
      daily: [],
      totals: { total_tokens: 0, total_requests: 0, cached_pct: 0, local_pct: 0, by_tier: { haiku: 0, sonnet: 0, opus: 0 } },
    };
  }
}
