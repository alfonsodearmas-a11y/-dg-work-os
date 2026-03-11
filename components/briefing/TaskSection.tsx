'use client';

import { AlertTriangle, Ghost } from 'lucide-react';
import type { Action, ActionsData } from './types';
import { AgencyTag, CardsSkeleton } from './briefing-shared';

function SeverityCard({ action }: { action: Action }) {
  const borderColor =
    action.overdueDays >= 7 ? 'border-l-red-500 bg-red-500/[0.03]' :
    action.overdueDays >= 3 ? 'border-l-amber-500' : 'border-l-navy-800';

  return (
    <a
      href={action.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border border-navy-800/50 ${borderColor} border-l-4 bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-navy-800 transition-all duration-200 group`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-base font-medium group-hover:text-gold-500 transition-colors">
            {action.title}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <AgencyTag agency={action.agency} />
            {action.assignee && (
              <span className="text-xs text-navy-600 font-medium">{action.assignee}</span>
            )}
          </div>
        </div>
        <span className="rounded-lg bg-red-500/20 text-red-400 font-bold px-3 py-1 text-sm whitespace-nowrap shrink-0">
          {action.overdueDays}d overdue
        </span>
      </div>
    </a>
  );
}

export function TriageSection({ actions, compact = false }: { actions: ActionsData | null; compact?: boolean }) {
  if (!actions) return <CardsSkeleton />;

  const { overdue, dueToday, dueThisWeek } = actions;
  const hasItems = overdue.length > 0 || dueToday.length > 0 || dueThisWeek.length > 0;

  if (!hasItems) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-[#0f1d32] p-6 text-center">
        <p className="text-emerald-400 text-base font-medium">All clear — no action items requiring attention.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h3 className="text-lg font-bold text-red-400">Overdue</h3>
            </div>
            <span className="rounded-lg bg-red-500/15 text-red-400 font-bold px-3 py-1 text-sm">{overdue.length}</span>
          </div>
          <div className="space-y-3">
            {(compact ? overdue.slice(0, 5) : overdue).map(a => (
              <SeverityCard key={a.id} action={a} />
            ))}
          </div>
          {compact && overdue.length > 5 && (
            <p className="text-navy-600 text-xs mt-3">+{overdue.length - 5} more overdue items</p>
          )}
        </div>
      )}

      {dueToday.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gold-500">Due Today</h3>
            <span className="rounded-lg bg-gold-500/15 text-gold-500 font-bold px-3 py-1 text-sm">{dueToday.length}</span>
          </div>
          <div className="space-y-3">
            {dueToday.map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-navy-800/50 border-l-4 border-l-gold-500 bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-navy-800 transition-all duration-200 group"
              >
                <p className="text-white text-base font-medium group-hover:text-gold-500 transition-colors">{a.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <AgencyTag agency={a.agency} />
                  {a.assignee && <span className="text-xs text-navy-600 font-medium">{a.assignee}</span>}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {dueThisWeek.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-400">This Week</h3>
            <span className="rounded-lg bg-navy-900 text-slate-400 font-bold px-3 py-1 text-sm">{dueThisWeek.length}</span>
          </div>
          <div className="space-y-3">
            {(compact ? dueThisWeek.slice(0, 3) : dueThisWeek).map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-navy-800/50 bg-[#0f1d32] p-4 md:p-5 hover:translate-x-1 hover:border-navy-800 transition-all duration-200 group"
              >
                <p className="text-white text-base font-medium group-hover:text-gold-500 transition-colors">{a.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <AgencyTag agency={a.agency} />
                  {a.assignee && <span className="text-xs text-navy-600 font-medium">{a.assignee}</span>}
                </div>
              </a>
            ))}
          </div>
          {compact && dueThisWeek.length > 3 && (
            <p className="text-navy-600 text-xs mt-3">+{dueThisWeek.length - 3} more this week</p>
          )}
        </div>
      )}
    </div>
  );
}

export function StaleSection({ actions }: { actions: ActionsData | null }) {
  if (!actions) return <CardsSkeleton />;
  const { stale } = actions;

  if (stale.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-[#0f1d32] p-6 text-center">
        <p className="text-emerald-400 text-base font-medium">No stale items. All actions are being tracked.</p>
      </div>
    );
  }

  const critical = stale.filter(a => a.staleDays >= 21);
  const warning = stale.filter(a => a.staleDays >= 14 && a.staleDays < 21);
  const watch = stale.filter(a => a.staleDays < 14);

  const groups = [
    { label: 'Critical', sublabel: '21+ days silent', items: critical, color: 'red' as const },
    { label: 'Warning', sublabel: '14–20 days', items: warning, color: 'amber' as const },
    { label: 'Watch', sublabel: '7–13 days', items: watch, color: 'default' as const },
  ].filter(g => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <Ghost className="h-5 w-5 text-amber-400" />
        <h3 className="text-lg font-bold text-amber-400">Falling Through the Cracks</h3>
      </div>

      {groups.map(group => (
        <div key={group.label}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${
            group.color === 'red' ? 'text-red-400' :
            group.color === 'amber' ? 'text-amber-400' : 'text-navy-600'
          }`}>
            {group.label} — {group.sublabel}
          </p>
          <div className="space-y-3">
            {group.items.map(a => {
              const barPct = Math.min(100, Math.round((a.staleDays / 30) * 100));
              const barColor =
                a.staleDays >= 21 ? 'bg-red-500' :
                a.staleDays >= 14 ? 'bg-amber-500' : 'bg-navy-600';
              const isPulsing = a.staleDays >= 21;

              return (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block rounded-xl border bg-[#0f1d32] p-4 md:p-5 hover:border-navy-800 transition-all duration-200 group ${
                    isPulsing ? 'border-red-500/30 animate-[pulse-border_3s_ease-in-out_infinite]' : 'border-navy-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-base font-medium group-hover:text-gold-500 transition-colors">
                        {a.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <AgencyTag agency={a.agency} />
                        {a.assignee && <span className="text-xs text-navy-600 font-medium">{a.assignee}</span>}
                      </div>
                    </div>
                    <span className={`text-2xl font-black shrink-0 ${
                      a.staleDays >= 21 ? 'text-red-400' :
                      a.staleDays >= 14 ? 'text-amber-400' : 'text-navy-600'
                    }`}>
                      {a.staleDays}d
                    </span>
                  </div>
                  {/* Decay bar */}
                  <div className="w-full h-1.5 rounded-full bg-navy-900 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-500`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
