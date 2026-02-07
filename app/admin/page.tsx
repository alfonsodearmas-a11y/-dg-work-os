'use client';

import { useState, useEffect } from 'react';
import { Settings, Cpu, Zap, Database, TrendingDown } from 'lucide-react';

interface DailyUsage {
  date: string;
  haiku_tokens: number;
  sonnet_tokens: number;
  opus_tokens: number;
  cached_count: number;
  local_count: number;
  total_requests: number;
}

interface UsageStats {
  daily: DailyUsage[];
  totals: {
    total_tokens: number;
    total_requests: number;
    cached_pct: number;
    local_pct: number;
    by_tier: { haiku: number; sonnet: number; opus: number };
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function AIUsageSection() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/usage?days=7')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">AI Usage</h2>
        </div>
        <p className="text-[#64748b] text-sm">Loading usage data...</p>
      </div>
    );
  }

  if (!stats || stats.totals.total_requests === 0) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">AI Usage</h2>
        </div>
        <p className="text-[#64748b] text-sm">No AI usage data yet. Usage will appear here once the AI assistant is used.</p>
      </div>
    );
  }

  const { totals, daily } = stats;
  const totalTierTokens = totals.by_tier.haiku + totals.by_tier.sonnet + totals.by_tier.opus;
  const haikuPct = totalTierTokens > 0 ? Math.round((totals.by_tier.haiku / totalTierTokens) * 100) : 0;
  const sonnetPct = totalTierTokens > 0 ? Math.round((totals.by_tier.sonnet / totalTierTokens) * 100) : 0;
  const opusPct = totalTierTokens > 0 ? Math.round((totals.by_tier.opus / totalTierTokens) * 100) : 0;

  // Find max tokens for chart scaling
  const maxDayTokens = Math.max(...daily.map(d => d.haiku_tokens + d.sonnet_tokens + d.opus_tokens), 1);

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-2 mb-6">
        <Cpu className="h-5 w-5 text-[#d4af37]" />
        <h2 className="text-lg font-semibold text-white">AI Usage (7 days)</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Requests</p>
          <p className="text-xl font-bold text-white">{totals.total_requests}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Tokens</p>
          <p className="text-xl font-bold text-white">{formatTokens(totals.total_tokens)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-1 mb-1">
            <Database className="h-3 w-3 text-white/40" />
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Cache Hit</p>
          </div>
          <p className="text-xl font-bold text-[#3b82f6]">{totals.cached_pct}%</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-1 mb-1">
            <Zap className="h-3 w-3 text-white/40" />
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Local Answers</p>
          </div>
          <p className="text-xl font-bold text-[#22c55e]">{totals.local_pct}%</p>
        </div>
      </div>

      {/* Tier distribution bar */}
      <div className="mb-6">
        <p className="text-xs text-white/40 mb-2">Token Distribution by Model</p>
        <div className="h-3 rounded-full overflow-hidden flex bg-white/5">
          {haikuPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${haikuPct}%`, background: '#22c55e' }}
              title={`Haiku: ${haikuPct}%`}
            />
          )}
          {sonnetPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${sonnetPct}%`, background: '#3b82f6' }}
              title={`Sonnet: ${sonnetPct}%`}
            />
          )}
          {opusPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${opusPct}%`, background: '#d4af37' }}
              title={`Opus: ${opusPct}%`}
            />
          )}
        </div>
        <div className="flex gap-4 mt-2 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
            <span className="text-white/50">Haiku {haikuPct}%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
            <span className="text-white/50">Sonnet {sonnetPct}%</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#d4af37]" />
            <span className="text-white/50">Opus {opusPct}%</span>
          </span>
        </div>
      </div>

      {/* Daily chart (simple bar chart) */}
      <div>
        <p className="text-xs text-white/40 mb-3">Daily Token Usage</p>
        <div className="flex items-end gap-1 h-24">
          {daily.map((d) => {
            const total = d.haiku_tokens + d.sonnet_tokens + d.opus_tokens;
            const height = Math.max(4, (total / maxDayTokens) * 100);
            const hPct = total > 0 ? (d.haiku_tokens / total) * 100 : 0;
            const sPct = total > 0 ? (d.sonnet_tokens / total) * 100 : 0;

            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end group relative"
                title={`${d.date}: ${formatTokens(total)} tokens, ${d.total_requests} requests`}
              >
                <div
                  className="w-full rounded-t overflow-hidden"
                  style={{ height: `${height}%` }}
                >
                  <div className="h-full flex flex-col justify-end">
                    {d.opus_tokens > 0 && (
                      <div style={{ height: `${100 - hPct - sPct}%`, background: '#d4af37' }} />
                    )}
                    {d.sonnet_tokens > 0 && (
                      <div style={{ height: `${sPct}%`, background: '#3b82f6' }} />
                    )}
                    {d.haiku_tokens > 0 && (
                      <div style={{ height: `${hPct}%`, background: '#22c55e' }} />
                    )}
                  </div>
                </div>
                <p className="text-[9px] text-white/30 text-center mt-1 truncate">
                  {d.date.slice(5)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost savings indicator */}
      {(totals.cached_pct > 0 || totals.local_pct > 0) && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/20">
          <TrendingDown className="h-4 w-4 text-[#22c55e]" />
          <p className="text-xs text-[#22c55e]">
            {totals.cached_pct + totals.local_pct}% of requests served at zero API cost (cached + local answers)
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center space-x-3 mb-8">
        <Settings className="h-8 w-8 text-[#d4af37]" />
        <div>
          <h1 className="text-3xl font-bold text-white">Admin</h1>
          <p className="text-[#64748b] text-sm mt-1">User management & data entry portal</p>
        </div>
      </div>

      <div className="space-y-6">
        <AIUsageSection />

        <div className="card-premium p-8 text-center">
          <p className="text-[#64748b]">User management & data entry coming soon</p>
        </div>
      </div>
    </div>
  );
}
