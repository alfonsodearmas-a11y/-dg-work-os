import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/db';
import { ModelTier, CachedResponse } from './types';

// ── Cache TTL by tier ───────────────────────────────────────────────────────

const CACHE_TTL_HOURS: Record<ModelTier, number> = {
  haiku: 24,   // factual answers valid all day
  sonnet: 12,  // general answers valid half day
  opus: 0,     // never cache opus (too nuanced)
};

// ── Hash ────────────────────────────────────────────────────────────────────

export function hashQuery(query: string, page: string): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${normalized}|${page}|${todayKey()}`).digest('hex');
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // daily rotation
}

// ── Lookup ──────────────────────────────────────────────────────────────────

export async function getCachedResponse(query: string, page: string): Promise<CachedResponse | null> {
  try {
    const hash = hashQuery(query, page);
    const { data } = await supabaseAdmin
      .from('ai_response_cache')
      .select('response_text, suggestions, actions, model_tier, created_at')
      .eq('query_hash', hash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!data) return null;

    return {
      response_text: data.response_text,
      suggestions: data.suggestions,
      actions: data.actions,
      model_tier: data.model_tier as ModelTier,
      created_at: data.created_at,
    };
  } catch (err) {
    console.error('[ai/cache] Lookup error:', err);
    return null;
  }
}

// ── Store ───────────────────────────────────────────────────────────────────

export async function cacheResponse(
  query: string,
  page: string,
  tier: ModelTier,
  responseText: string,
  suggestions: string[] | null,
  actions: Array<{ label: string; route: string }> | null,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const ttlHours = CACHE_TTL_HOURS[tier];
  if (ttlHours === 0) return; // don't cache opus

  try {
    const hash = hashQuery(query, page);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from('ai_response_cache')
      .upsert({
        query_hash: hash,
        query_text: query.slice(0, 500),
        current_page: page,
        model_tier: tier,
        response_text: responseText,
        suggestions,
        actions,
        usage_input_tokens: inputTokens,
        usage_output_tokens: outputTokens,
        expires_at: expiresAt,
      }, { onConflict: 'query_hash' });
  } catch (err) {
    console.error('[ai/cache] Store error:', err);
  }
}

// ── Cleanup (called by precompute cron) ─────────────────────────────────────

export async function cleanupExpiredCache(): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from('ai_response_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    return data?.length || 0;
  } catch {
    return 0;
  }
}
