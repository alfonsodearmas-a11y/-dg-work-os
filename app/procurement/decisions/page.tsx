'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft, ScrollText,
  Archive, RotateCcw, Eye, EyeOff,
  SkipForward, X, Check, Plus, ArrowRight, Layers, Settings,
} from 'lucide-react';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';

interface DecisionLogRow {
  id: string;
  decision_type: string;
  target_kind: 'tender' | 'review_row';
  target_id: string;
  target_label: string | null;
  agency: string;
  actor_id: string;
  actor_name: string | null;
  actor_role: string;
  reason_code: string | null;
  reason_text: string | null;
  decided_at: string;
  approval_state: string;
}

const DECISION_META: Record<
  string,
  { label: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  archive:           { label: 'Archived',           color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     Icon: Archive },
  unarchive:         { label: 'Unarchived',         color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', Icon: RotateCcw },
  resurrect:         { label: 'Resurrected',        color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  Icon: Eye },
  revoke_tracking:   { label: 'Tracking revoked',   color: 'text-slate-300',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   Icon: EyeOff },
  skip:              { label: 'Skipped',            color: 'text-slate-300',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   Icon: SkipForward },
  permanent_ignore:  { label: 'Permanently ignored',color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     Icon: X },
  match:             { label: 'Matched',            color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', Icon: Check },
  create_from_review:{ label: 'Created from review',color: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    Icon: Plus },
  assign_stage:      { label: 'Stage assigned',     color: 'text-gold-500',    bg: 'bg-gold-500/10',    border: 'border-gold-500/30',    Icon: ArrowRight },
  status_change:     { label: 'Status changed',     color: 'text-gold-500',    bg: 'bg-gold-500/10',    border: 'border-gold-500/30',    Icon: ArrowRight },
  system_collapse:   { label: 'System collapse',    color: 'text-slate-400',   bg: 'bg-navy-900',       border: 'border-navy-800',       Icon: Layers },
};

const DEFAULT_META = { label: 'Decision', color: 'text-slate-300', bg: 'bg-navy-900', border: 'border-navy-800', Icon: Settings };

function metaFor(type: string) {
  return DECISION_META[type] ?? DEFAULT_META;
}

export default function DecisionsPage() {
  const [rows, setRows] = useState<DecisionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/decisions');
    if (res.ok) {
      const data = await res.json();
      setRows(data.decisions || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.decision_type === filter);
  }, [rows, filter]);

  const types = useMemo(() => {
    const set = new Set(rows.map((r) => r.decision_type));
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-gold-500" /> Decisions Log
          </h1>
          <p className="text-xs md:text-sm text-navy-600">
            Every Archive, Resurrect, Skip, Match, and system mutation in the procurement pipeline. Filtered to your scope.
          </p>
        </div>
      </div>

      {!loading && types.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter('')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === '' ? 'bg-gold-500/20 text-gold-500 border-gold-500/40' : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-navy-700'
            }`}
          >
            All ({rows.length})
          </button>
          {types.map((t) => {
            const m = metaFor(t);
            const count = rows.filter((r) => r.decision_type === t).length;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === t ? `${m.bg} ${m.color} ${m.border}` : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-navy-700'
                }`}
              >
                {m.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">No decisions recorded yet for your scope.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const m = metaFor(d.decision_type);
            const Icon = m.Icon;
            return (
              <div key={d.id} className={`rounded-xl border ${m.border} ${m.bg} p-3`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${m.bg} ${m.border} border`}>
                    <Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>
                      <AgencyBadge agency={d.agency} />
                      {d.reason_code && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-navy-800 text-slate-400 border border-navy-700">
                          {d.reason_code}
                        </span>
                      )}
                      {d.approval_state !== 'none' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {d.approval_state}
                        </span>
                      )}
                    </div>
                    {d.target_label && (
                      <p className="text-sm text-white truncate mt-1">{d.target_label}</p>
                    )}
                    {d.reason_text && (
                      <p className="text-[11px] text-navy-500 italic mt-0.5 truncate">{d.reason_text}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-navy-600 mt-1">
                      <span>{d.actor_name || d.actor_id.slice(0, 8)}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider">{d.actor_role}</span>
                      <span>·</span>
                      <span>{format(parseISO(d.decided_at), 'd MMM yyyy HH:mm')}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
