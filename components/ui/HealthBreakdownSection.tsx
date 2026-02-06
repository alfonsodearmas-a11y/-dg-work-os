'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { HealthBreakdownItem } from '@/lib/agency-health';

interface HealthBreakdownSectionProps {
  breakdown: HealthBreakdownItem[];
  score: number;
  label?: string;
  severity?: 'critical' | 'warning' | 'stable' | 'positive';
}

function dotColor(score: number): string {
  if (score >= 7) return 'bg-emerald-400';
  if (score >= 4) return 'bg-amber-400';
  return 'bg-red-400';
}

export function HealthBreakdownSection({ breakdown, score, label, severity }: HealthBreakdownSectionProps) {
  const [open, setOpen] = useState(false);

  if (!breakdown || breakdown.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[#64748b] hover:text-[#94a3b8] transition-colors text-xs"
      >
        <Info size={12} />
        <span>How is this calculated?</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`collapse-grid ${open ? 'open' : ''}`}>
        <div>
          <div className="mt-2 bg-[#0a1628] rounded-lg border border-[#2d3a52] overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-b border-[#2d3a52] text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">
              <span>Factor</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Value</span>
              <span className="text-right">Score</span>
            </div>

            {/* Rows */}
            {breakdown.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-b border-[#2d3a52]/50 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(item.score)}`} />
                    <span className="text-[#e2e8f0] text-xs truncate">{item.factor}</span>
                  </div>
                  {item.description && (
                    <p className="text-[#64748b] text-[10px] mt-0.5 ml-3.5 leading-snug">{item.description}</p>
                  )}
                </div>
                <span className="text-[#94a3b8] text-xs text-right self-start pt-0.5">{Math.round(item.weight * 100)}%</span>
                <span className="text-[#d4af37] text-xs text-right self-start pt-0.5 truncate">{item.actualValue}</span>
                <span className="text-white text-xs text-right font-medium self-start pt-0.5">{item.score}</span>
              </div>
            ))}

            {/* Footer: weighted average */}
            <div className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-t border-[#2d3a52] bg-[#1a2744]/50">
              <span className="text-[#94a3b8] text-xs font-medium">Weighted Average</span>
              <span />
              <span className={`text-xs text-right font-semibold ${
                severity === 'critical' ? 'text-red-400'
                  : severity === 'warning' ? 'text-amber-400'
                  : severity === 'positive' ? 'text-emerald-400'
                  : 'text-blue-400'
              }`}>
                {label || ''}
              </span>
              <span className="text-white text-xs text-right font-bold">{score.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
