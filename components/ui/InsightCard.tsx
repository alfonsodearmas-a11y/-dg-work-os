'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const INSIGHT_SEVERITY: Record<string, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Critical' },
  warning:  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warning' },
  stable:   { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Stable' },
  positive: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Good' },
};

export interface InsightCardData {
  emoji: string;
  title: string;
  severity: string;
  summary: string;
  detail: string | null;
}

export function InsightCard({ card }: { card: InsightCardData }) {
  const [expanded, setExpanded] = useState(false);
  const sev = INSIGHT_SEVERITY[card.severity] || INSIGHT_SEVERITY.stable;
  const hasDetail = card.detail && card.detail.length > 0;

  return (
    <div className={`bg-[#1a2744] rounded-xl border ${sev.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`w-full text-left px-4 py-3.5 transition-colors ${hasDetail ? 'hover:bg-white/[0.02] cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">{card.emoji}</span>
            <span className="text-[17px] font-semibold text-white">{card.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[13px] font-medium ${sev.bg} ${sev.text}`}>
              {sev.label}
            </span>
            {hasDetail && (
              <ChevronDown className={`w-4 h-4 text-[#64748b] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            )}
          </div>
        </div>
        <p className="text-[15px] text-[#c8d0dc] leading-snug">{card.summary}</p>
      </button>
      {hasDetail && (
        <div className={`collapse-grid ${expanded ? 'open' : ''}`}>
          <div>
            <div className="px-4 pb-4 pt-0">
              <div className="bg-[#0a1628] rounded-lg p-4 border border-[#2d3a52]">
                <p className="text-[15px] text-[#94a3b8] leading-relaxed whitespace-pre-line">{card.detail}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
