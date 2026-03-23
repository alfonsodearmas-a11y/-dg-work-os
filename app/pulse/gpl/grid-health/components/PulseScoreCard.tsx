'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import { Sparkline } from '@/components/intel/common';
import { fmtRelativeTime } from '@/lib/format';

interface PulseScoreData {
  overall: number;
  frequency_score: number;
  restoration_score: number;
  impact_score: number;
  outage_count_30d: number;
  avg_restoration_min: number;
  total_ens_mwh: number;
  last_synced: string;
  trend_7d: number[];
  stale?: boolean;
}

const SCORE_THEMES = {
  good: { color: '#10b981', textClass: 'text-emerald-400', bgClass: 'bg-emerald-500' },
  warn: { color: '#d4af37', textClass: 'text-gold-500', bgClass: 'bg-gold-500' },
  crit: { color: '#dc2626', textClass: 'text-red-400', bgClass: 'bg-red-500' },
} as const;

function getScoreTheme(score: number) {
  if (score >= 70) return SCORE_THEMES.good;
  if (score >= 40) return SCORE_THEMES.warn;
  return SCORE_THEMES.crit;
}

function SubScoreBar({ label, value }: { label: string; value: number }) {
  const theme = getScoreTheme(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-[72px] shrink-0 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-navy-950 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.bgClass}`}
          style={{ width: `${Math.max(value, 2)}%`, opacity: 0.85 }}
        />
      </div>
      <span className={`text-[11px] font-mono font-semibold w-7 text-right ${theme.textClass}`}>
        {value}
      </span>
    </div>
  );
}

export function PulseScoreCard() {
  const router = useRouter();
  const [data, setData] = useState<PulseScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchScore() {
      try {
        setLoading(true);
        const res = await fetch('/api/pulse/gpl/score');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json: PulseScoreData = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchScore();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-navy-900 backdrop-blur-sm border border-navy-800 rounded-2xl p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-navy-800" />
          <div className="h-5 bg-navy-800 rounded w-32" />
        </div>
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-navy-800" />
          <div className="flex-1 space-y-2">
            <div className="h-2 bg-navy-800 rounded w-full" />
            <div className="h-2 bg-navy-800 rounded w-3/4" />
            <div className="h-2 bg-navy-800 rounded w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-navy-900 backdrop-blur-sm border border-red-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20">
            <AlertTriangle className="text-red-400" size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">GPL Grid Health</p>
            <p className="text-xs text-red-400">{error || 'No data available'}</p>
          </div>
        </div>
      </div>
    );
  }

  const theme = getScoreTheme(data.overall);

  return (
    <div
      onClick={() => router.push('/pulse/gpl/grid-health')}
      className="bg-navy-900 backdrop-blur-sm border border-navy-800 rounded-2xl p-5 cursor-pointer transition-all duration-200 group hover:shadow-xl hover:border-gold-500/50 hover:shadow-gold-500/10"
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') router.push('/pulse/gpl/grid-health'); }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
            <Zap className="text-white" size={16} />
          </div>
          <span className="text-sm font-semibold text-white">GPL Grid Health</span>
        </div>
        {data.stale && (
          <div className="flex items-center gap-1 text-amber-400">
            <RefreshCw size={12} />
            <span className="text-[10px]">Stale</span>
          </div>
        )}
      </div>

      <div className="flex items-start gap-5">
        <div className="flex flex-col items-center shrink-0">
          <span
            className={`text-4xl font-bold tabular-nums ${theme.textClass}`}
          >
            {data.overall}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5">/ 100</span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <SubScoreBar label="Frequency" value={data.frequency_score} />
          <SubScoreBar label="Restoration" value={data.restoration_score} />
          <SubScoreBar label="Impact" value={data.impact_score} />

          {data.trend_7d && data.trend_7d.length >= 2 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-slate-500 w-[72px] text-right">7-day</span>
              <Sparkline
                data={data.trend_7d}
                color={theme.color}
                height={20}
                width={100}
                showDot
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-navy-800/50">
        <span className="text-[11px] text-slate-500">
          Last synced: {fmtRelativeTime(data.last_synced)}
        </span>
        <span className="text-[11px] text-slate-500 group-hover:text-gold-500 transition-colors">
          View details →
        </span>
      </div>
    </div>
  );
}
