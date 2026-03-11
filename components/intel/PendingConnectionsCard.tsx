'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClipboardList, ArrowRight, Clock } from 'lucide-react';
import type { PendingApplicationStats } from '@/lib/pending-applications-types';

const BRACKET_COLORS = ['#059669', '#d4af37', '#f97316', '#dc2626'];

interface Props {
  agency?: 'GPL' | 'GWI';
  compact?: boolean;
}

export function PendingConnectionsCard({ agency, compact }: Props) {
  const [stats, setStats] = useState<{ gpl: PendingApplicationStats; gwi: PendingApplicationStats } | null>(null);

  useEffect(() => {
    fetch('/api/pending-applications/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const agencyStats = agency ? stats[agency.toLowerCase() as 'gpl' | 'gwi'] : null;
  const total = agency ? (agencyStats?.total || 0) : (stats.gpl.total + stats.gwi.total);
  const avgDays = agency
    ? (agencyStats?.avgDaysWaiting || 0)
    : total > 0
      ? Math.round((stats.gpl.avgDaysWaiting * stats.gpl.total + stats.gwi.avgDaysWaiting * stats.gwi.total) / total)
      : 0;
  const brackets = agency
    ? (agencyStats?.waitBrackets || [])
    : stats.gpl.waitBrackets.map((b, i) => ({
        ...b,
        count: b.count + (stats.gwi.waitBrackets[i]?.count || 0),
      }));
  const bracketTotal = brackets.reduce((a, b) => a + b.count, 0) || 1;

  const linkHref = agency
    ? `/intel/pending-applications?agency=${agency}`
    : '/intel/pending-applications';

  if (compact) {
    return (
      <Link href={linkHref} className="card-premium p-4 hover:border-gold-500/50 transition-colors block">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-white">Pending Connections</span>
          </div>
          <ArrowRight className="h-4 w-4 text-navy-600" />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-white">{total}</div>
            <div className="text-xs text-navy-600">avg {avgDays} days wait</div>
          </div>
          {/* Mini bracket bar */}
          <div className="flex h-6 w-24 rounded overflow-hidden">
            {brackets.map((b, i) => (
              b.count > 0 && (
                <div
                  key={i}
                  style={{
                    width: `${(b.count / bracketTotal) * 100}%`,
                    backgroundColor: BRACKET_COLORS[i],
                  }}
                />
              )
            ))}
          </div>
        </div>
      </Link>
    );
  }

  // Full version for agency detail pages
  return (
    <div className="card-premium p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">
            Pending Service Connections {agency ? `(${agency})` : ''}
          </span>
        </div>
        <Link
          href={linkHref}
          className="text-xs text-gold-500 hover:text-[#f0d060] flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-xs text-navy-600">applications</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{avgDays}<span className="text-base font-normal text-navy-600">d</span></div>
          <div className="text-xs text-navy-600">avg wait</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${(brackets[3]?.count || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {brackets[3]?.count || 0}
          </div>
          <div className="text-xs text-navy-600">&gt; 30 days</div>
        </div>
      </div>

      {/* Bracket bar with labels */}
      <div>
        <div className="flex h-5 rounded-lg overflow-hidden mb-2">
          {brackets.map((b, i) => (
            b.count > 0 && (
              <div
                key={i}
                className="flex items-center justify-center text-[10px] font-bold text-white/90"
                style={{
                  width: `${(b.count / bracketTotal) * 100}%`,
                  backgroundColor: BRACKET_COLORS[i],
                  minWidth: b.count > 0 ? '20px' : 0,
                }}
              >
                {b.count}
              </div>
            )
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-navy-600">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt;7d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gold-500" /> 7–14d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> 15–30d</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &gt;30d</span>
        </div>
      </div>

      {agencyStats?.dataAsOf && (
        <div className="flex items-center gap-1.5 text-[10px] text-navy-600">
          <Clock className="h-3 w-3" />
          Data as of {new Date(agencyStats.dataAsOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
