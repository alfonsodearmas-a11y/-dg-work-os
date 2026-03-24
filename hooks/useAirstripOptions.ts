'use client';

import { useState, useEffect } from 'react';
import type { AirstripOption, AirstripOptionCategory } from '@/lib/airstrip-types';

// Module-level cache shared across all hook instances
const cache: Record<string, { data: AirstripOption[]; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-flight request dedup
const inflight: Record<string, Promise<AirstripOption[]>> = {};

async function fetchCategory(category: string): Promise<AirstripOption[]> {
  // Return cached if fresh
  const cached = cache[category];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  // Dedup concurrent requests for same category
  if (category in inflight) return inflight[category];

  inflight[category] = (async () => {
    try {
      const res = await fetch(`/api/airstrips/options?category=${encodeURIComponent(category)}`);
      if (!res.ok) throw new Error('Failed to fetch options');
      const json = await res.json();
      const data: AirstripOption[] = json.options?.[category] ?? [];
      cache[category] = { data, ts: Date.now() };
      return data;
    } finally {
      delete inflight[category];
    }
  })();

  return inflight[category];
}

/**
 * Fetches and caches airstrip dropdown options by category.
 * Returns { options, loading, labelFor }.
 */
export function useAirstripOptions(category: AirstripOptionCategory) {
  const [options, setOptions] = useState<AirstripOption[]>(() => cache[category]?.data ?? []);
  const [loading, setLoading] = useState(!cache[category]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) setLoading(true);
      try {
        const data = await fetchCategory(category);
        if (!cancelled) {
          setOptions(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [category]);

  /** Resolve a value to its display label. Falls back to the value itself. */
  const labelFor = (value: string | null): string => {
    if (!value) return '—';
    const opt = options.find(o => o.value === value);
    return opt?.label ?? value;
  };

  return { options, loading, labelFor };
}

/**
 * Prefetch multiple categories in a single batch request.
 * Call this early (e.g. on page mount) to warm the cache.
 */
export async function prefetchAirstripOptions(categories: AirstripOptionCategory[]) {
  const needed = categories.filter(c => !cache[c] || Date.now() - cache[c].ts >= CACHE_TTL);
  if (needed.length === 0) return;

  try {
    const res = await fetch(`/api/airstrips/options?categories=${needed.join(',')}`);
    if (!res.ok) return;
    const json = await res.json();
    const grouped = json.options ?? {};
    for (const cat of needed) {
      if (grouped[cat]) {
        cache[cat] = { data: grouped[cat], ts: Date.now() };
      }
    }
  } catch { /* non-critical prefetch */ }
}
