'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { HEALTH_DOT } from './types';

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    delayed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'at-risk': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'ending-soon': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bond-warning': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-navy-800 text-slate-400'}`}>
      {status.replace('-', ' ')}
    </span>
  );
}

export function HealthDot({ health }: { health: string }) {
  const dot = HEALTH_DOT[health] || HEALTH_DOT.green;
  const labels: Record<string, string> = { green: 'On Track', amber: 'Minor Issues', red: 'Critical' };
  return (
    <span className="inline-flex items-center gap-1.5" title={labels[health] || health}>
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-label={`Health: ${labels[health] || health}`} />
      <span className="text-xs text-slate-400 hidden lg:inline">{labels[health] || health}</span>
    </span>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const safePct = pct ?? 0;
  const color = safePct >= 100 ? 'bg-emerald-500' : safePct >= 80 ? 'bg-emerald-500' : safePct >= 40 ? 'bg-amber-500' : safePct > 0 ? 'bg-red-500' : 'bg-navy-800';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-navy-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={safePct} aria-valuemin={0} aria-valuemax={100} aria-label={`Completion: ${safePct}%`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(safePct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{safePct}%</span>
    </div>
  );
}

export function OversightKpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <p className="text-navy-600 text-xs uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl md:text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-navy-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function MultiSelect({
  label, options, selected, onChange, renderOption,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  renderOption?: (opt: { value: string; label: string }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  function toggle(val: string) { onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]); }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none flex items-center gap-2 w-full md:min-w-[130px] md:w-auto">
        <span className="truncate">{selected.length ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-navy-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-navy-900 border border-navy-800 rounded-lg shadow-xl z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-navy-950/60 cursor-pointer text-sm">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="accent-gold-500" />
              {renderOption ? renderOption(opt) : <span className="text-white">{opt.label}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
