'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Gauge, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import type { EfficiencyMetrics } from '@/lib/service-connection-types';

interface Props {
  compact?: boolean;
}

export function ServiceConnectionCard({ compact }: Props) {
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);

  useEffect(() => {
    fetch('/api/service-connections/stats')
      .then(r => r.json())
      .then(setMetrics)
      .catch(() => {});
  }, []);

  if (!metrics) return null;

  // Only show if there's meaningful data
  if (metrics.totalOpen === 0 && metrics.totalCompleted === 0) return null;

  const latestMonth = metrics.monthly.length > 0 ? metrics.monthly[metrics.monthly.length - 1] : null;

  if (compact) {
    return (
      <Link href="/intel/service-connections" className="card-premium p-4 hover:border-[#d4af37]/50 transition-colors block">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Connection Efficiency</span>
          </div>
          <ArrowRight className="h-4 w-4 text-[#64748b]" />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-white">
              {metrics.overall.avgDays}<span className="text-base font-normal text-[#64748b]">d</span>
            </div>
            <div className="text-xs text-[#64748b]">avg completion</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold ${metrics.overall.slaPct >= 70 ? 'text-emerald-400' : metrics.overall.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {metrics.overall.slaPct}%
            </div>
            <div className="text-xs text-[#64748b]">SLA</div>
          </div>
        </div>
      </Link>
    );
  }

  // Full version
  return (
    <div className="card-premium p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Service Connection Efficiency</span>
        </div>
        <Link
          href="/intel/service-connections"
          className="text-xs text-[#d4af37] hover:text-[#f0d060] flex items-center gap-1"
        >
          View details <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className="text-2xl font-bold text-white">{metrics.overall.avgDays}<span className="text-sm font-normal text-[#64748b]">d</span></div>
          <div className="text-xs text-[#64748b]">avg completion</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${metrics.overall.slaPct >= 70 ? 'text-emerald-400' : metrics.overall.slaPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {metrics.overall.slaPct}%
          </div>
          <div className="text-xs text-[#64748b]">SLA compliance</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">{metrics.totalOpen}</div>
          <div className="text-xs text-[#64748b]">open orders</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-emerald-400">{latestMonth?.completed || 0}</div>
          <div className="text-xs text-[#64748b]">completed/mo</div>
        </div>
      </div>

      {/* Track comparison mini bars */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[#64748b]">Track A: {metrics.trackA.avgDays}d avg</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[#64748b]">Track B: {metrics.trackB.avgDays}d avg</span>
        </div>
      </div>
    </div>
  );
}
