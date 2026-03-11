'use client';

import React, { useMemo } from 'react';
import type { Project } from './types';
import { fmtRegion } from './types';

export function TimelineView({ projects, groupBy }: { projects: Project[]; groupBy: 'agency' | 'region' }) {
  const groups = useMemo(() => {
    const g: Record<string, Project[]> = {};
    for (const p of projects) {
      const key = groupBy === 'agency' ? (p.sub_agency || 'Unknown') : fmtRegion(p.region);
      if (!g[key]) g[key] = [];
      g[key].push(p);
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [projects, groupBy]);

  const now = new Date();
  const dates = projects.flatMap(p => {
    const d: Date[] = [];
    if (p.start_date) d.push(new Date(p.start_date));
    if (p.project_end_date) d.push(new Date(p.project_end_date));
    return d;
  }).filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) return <div className="card-premium p-8 text-center text-navy-600">No date data available for timeline view.</div>;

  const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime() - 365 * 86400000));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime() + 180 * 86400000));
  const totalDays = (maxDate.getTime() - minDate.getTime()) / 86400000;
  function getPos(ds: string | null) { if (!ds) return 0; const d = new Date(ds); return isNaN(d.getTime()) ? 0 : ((d.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100; }
  const nowPos = ((now.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
  const hc: Record<string, string> = { green: 'bg-emerald-500/80', amber: 'bg-amber-500/80', red: 'bg-red-500/80' };

  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="flex items-center border-b border-navy-800 px-4 py-2 relative">
            <div className="w-48 shrink-0 text-navy-600 text-xs font-medium uppercase">Project</div>
            <div className="flex-1 relative h-6">
              {Array.from({ length: Math.min(Math.ceil(totalDays / 30), 36) }).map((_, i) => {
                const d = new Date(minDate.getTime() + i * 30 * 86400000);
                return <span key={i} className="absolute text-[10px] text-navy-700 whitespace-nowrap" style={{ left: `${(i * 30 / totalDays) * 100}%` }}>{d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>;
              })}
            </div>
          </div>
          {groups.map(([name, items]) => (
            <div key={name}>
              <div className="px-4 py-2 bg-navy-950/60 border-b border-navy-800/50">
                <span className="text-gold-500 text-xs font-semibold">{name}</span>
                <span className="text-navy-600 text-xs ml-2">({items.length})</span>
              </div>
              {items.slice(0, 20).map(p => {
                const start = getPos(p.start_date || p.created_at);
                const end = getPos(p.project_end_date);
                const barLeft = Math.min(start, end || start);
                const barWidth = Math.max((end || start + 2) - barLeft, 1);
                return (
                  <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-navy-800/20 hover:bg-navy-900/30">
                    <div className="w-48 shrink-0 pr-2"><p className="text-white text-xs truncate" title={p.project_name || ''}>{p.project_name || '-'}</p></div>
                    <div className="flex-1 relative h-5">
                      <div className="absolute top-0 bottom-0 w-px bg-gold-500/30" style={{ left: `${nowPos}%` }} />
                      <div className={`absolute top-1 h-3 rounded-sm ${hc[p.health] || hc.green} ${p.escalated ? 'ring-1 ring-red-400' : ''}`} style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '4px' }} title={`${p.project_name} (${p.completion_pct}%)`}>
                        {barWidth > 5 && <div className="h-full bg-white/20 rounded-sm" style={{ width: `${Math.min(p.completion_pct, 100)}%` }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
