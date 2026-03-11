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
        className="flex items-center gap-1.5 text-navy-600 hover:text-slate-400 transition-colors text-xs"
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
          <div className="mt-2 bg-navy-950 rounded-lg border border-navy-800 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-b border-navy-800 text-[10px] uppercase tracking-wider text-navy-600 font-semibold">
              <span>Factor</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Value</span>
              <span className="text-right">Score</span>
            </div>

            {/* Rows */}
            {breakdown.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-b border-navy-800/50 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(item.score)}`} aria-label={`Score: ${item.score >= 7 ? 'Good' : item.score >= 4 ? 'Warning' : 'Critical'}`} />
                    <span className="text-slate-200 text-xs truncate">{item.factor}</span>
                  </div>
                  {item.description && (
                    <p className="text-navy-600 text-[10px] mt-0.5 ml-3.5 leading-snug">{item.description}</p>
                  )}
                </div>
                <span className="text-slate-400 text-xs text-right self-start pt-0.5">{Math.round(item.weight * 100)}%</span>
                <span className="text-gold-500 text-xs text-right self-start pt-0.5 truncate">{item.actualValue}</span>
                <span className="text-white text-xs text-right font-medium self-start pt-0.5">{item.score}</span>
              </div>
            ))}

            {/* Footer: weighted average */}
            <div className="grid grid-cols-[1fr_50px_70px_40px] gap-2 px-3 py-2 border-t border-navy-800 bg-navy-900/50">
              <span className="text-slate-400 text-xs font-medium">Weighted Average</span>
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
