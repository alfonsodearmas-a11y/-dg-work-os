'use client';

import React, { useMemo } from 'react';
import type { Project } from '@/types/projects';
import { HEALTH_DOT } from '@/lib/constants/agencies';

function fmtRegion(code: string | null): string {
  if (!code) return '-';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}

export function ProjectTimelineView({ projects, groupBy }: { projects: Project[]; groupBy: 'agency' | 'region' }) {
  // Group projects
  const groups = useMemo(() => {
    const g: Record<string, Project[]> = {};
    for (const p of projects) {
      const key = groupBy === 'agency' ? (p.sub_agency || 'Unknown') : fmtRegion(p.region);
      if (!g[key]) g[key] = [];
      g[key].push(p);
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [projects, groupBy]);

  // Calculate timeline range
  const now = new Date();
  const dates = projects.flatMap(p => {
    const d: Date[] = [];
    if (p.start_date) d.push(new Date(p.start_date));
    if (p.project_end_date) d.push(new Date(p.project_end_date));
    return d;
  }).filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) {
    return <div className="card-premium p-8 text-center text-navy-600">No date data available for timeline view.</div>;
  }

  const minDate = new Date(Math.min(...dates.map(d => d.getTime()), now.getTime() - 365 * 86400000));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), now.getTime() + 180 * 86400000));
  const totalDays = (maxDate.getTime() - minDate.getTime()) / 86400000;

  function getPosition(dateStr: string | null): number {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return ((d.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
  }

  const nowPosition = ((now.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;

  const healthColor: Record<string, string> = {
    green: 'bg-emerald-500/80',
    amber: 'bg-amber-500/80',
    red: 'bg-red-500/80',
  };

  // Compute tick interval: aim for ~8-12 labels max
  const tickMonths = totalDays <= 180 ? 1 : totalDays <= 365 ? 2 : totalDays <= 730 ? 3 : totalDays <= 1460 ? 6 : 12;
  const ticks: { date: Date; pos: number }[] = [];
  {
    const tickStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let cursor = new Date(tickStart);
    while (cursor.getTime() <= maxDate.getTime()) {
      const pos = ((cursor.getTime() - minDate.getTime()) / 86400000 / totalDays) * 100;
      if (pos >= 0 && pos <= 100) ticks.push({ date: new Date(cursor), pos });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + tickMonths, 1);
    }
  }

  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header with months */}
          <div className="flex items-center border-b border-navy-800 px-4 py-2 relative">
            <div className="w-64 shrink-0 text-navy-600 text-xs font-medium uppercase">Project</div>
            <div className="flex-1 relative h-6">
              {/* Month markers — spaced by computed interval */}
              {ticks.map((t, i) => (
                <span key={i} className="absolute text-[10px] text-navy-700 whitespace-nowrap" style={{ left: `${t.pos}%`, transform: 'translateX(-50%)' }}>
                  {t.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </span>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.map(([groupName, items]) => (
            <div key={groupName}>
              <div className="px-4 py-2 bg-navy-950/60 border-b border-navy-800/50">
                <span className="text-gold-500 text-xs font-semibold">{groupName}</span>
                <span className="text-navy-600 text-xs ml-2">({items.length})</span>
              </div>
              {items.slice(0, 20).map(p => {
                const start = getPosition(p.start_date || p.created_at);
                const end = getPosition(p.project_end_date);
                const barLeft = Math.min(start, end || start);
                const barWidth = Math.max((end || start + 2) - barLeft, 1);

                return (
                  <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-navy-800/20 hover:bg-navy-900/30 group/row">
                    <div className="w-64 shrink-0 pr-2 relative">
                      <p className="text-white text-xs truncate">{p.project_name || '-'}</p>
                      {/* Tooltip on hover showing full name */}
                      {p.project_name && p.project_name.length > 35 && (
                        <div className="hidden group-hover/row:block absolute left-0 top-full z-20 mt-1 px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg shadow-xl text-white text-xs max-w-sm whitespace-normal">
                          {p.project_name}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 relative h-5">
                      {/* Now line */}
                      <div className="absolute top-0 bottom-0 w-px bg-gold-500/30" style={{ left: `${nowPosition}%` }} />
                      {/* Bar */}
                      <div
                        className={`absolute top-1 h-3 rounded-sm ${healthColor[p.health] || healthColor.green} ${p.escalated ? 'ring-1 ring-red-400' : ''}`}
                        style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '4px' }}
                        title={`${p.project_name} (${p.completion_pct}%)`}
                      >
                        {barWidth > 5 && (
                          <div className="h-full bg-white/20 rounded-sm" style={{ width: `${Math.min(p.completion_pct, 100)}%` }} />
                        )}
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
