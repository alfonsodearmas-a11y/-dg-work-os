'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft, Activity as ActivityIcon, ArrowRight, Eye, EyeOff,
  Archive, RotateCcw, SkipForward, X, Check, Plus, Layers, Settings,
} from 'lucide-react';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';

type ActivityType = 'field_change' | 'presence' | 'decision';

interface ActivityItem {
  type: ActivityType;
  id: string;
  at: string;
  agency: string;
  tender_id: string | null;
  tender_description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  event_type?: string;
  decision_type?: string;
  reason_code?: string | null;
  reason_text?: string | null;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const DECISION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  archive: Archive, unarchive: RotateCcw,
  resurrect: Eye, revoke_tracking: EyeOff,
  skip: SkipForward, permanent_ignore: X,
  match: Check, create_from_review: Plus,
  assign_stage: ArrowRight, status_change: ArrowRight,
  system_collapse: Layers,
};

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityType | ''>('');

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/activity');
    if (res.ok) {
      const data = await res.json();
      setItems(data.items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filter ? items.filter((i) => i.type === filter) : items, [items, filter]);
  const counts = useMemo(() => {
    const out: Record<ActivityType, number> = { field_change: 0, presence: 0, decision: 0 };
    for (const i of items) out[i.type]++;
    return out;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <ActivityIcon className="h-5 w-5 text-gold-500" /> Activity Feed
          </h1>
          <p className="text-xs md:text-sm text-navy-600">
            Field changes, presence events, and decisions in chronological order. Filtered to your scope.
          </p>
        </div>
        <Link href="/procurement/inbox" className="text-xs text-navy-600 hover:text-white transition-colors">Inbox →</Link>
      </div>

      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter('')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === '' ? 'bg-gold-500/20 text-gold-500 border-gold-500/40' : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-navy-700'
            }`}
          >
            All ({items.length})
          </button>
          {(['decision', 'field_change', 'presence'] as ActivityType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filter === t ? 'bg-gold-500/20 text-gold-500 border-gold-500/40' : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-navy-700'
              }`}
            >
              {t === 'field_change' ? 'Field changes' : t === 'presence' ? 'Presence' : 'Decisions'} ({counts[t]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">{items.length === 0 ? 'No activity yet for your scope.' : 'No items match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="rounded-xl border border-navy-800 bg-navy-900/40 p-3">
              <div className="flex items-start gap-3">
                <ActivityBullet item={item} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-0.5">
                    <ActivityHeader item={item} />
                    <AgencyBadge agency={item.agency} />
                  </div>
                  {item.tender_description && (
                    <p className="text-sm text-white truncate">{item.tender_description}</p>
                  )}
                  <ActivityBody item={item} />
                  <div className="flex items-center gap-2 text-[10px] text-navy-600 mt-1">
                    {item.actor_name && <><span>{item.actor_name}</span><span>·</span></>}
                    {item.actor_role && <><span className="uppercase tracking-wider">{item.actor_role}</span><span>·</span></>}
                    <span>{format(parseISO(item.at), 'd MMM yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityBullet({ item }: { item: ActivityItem }) {
  if (item.type === 'decision') {
    const Icon = (item.decision_type && DECISION_ICONS[item.decision_type]) || Settings;
    return (
      <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-gold-500/10 border border-gold-500/30">
        <Icon className="h-3.5 w-3.5 text-gold-500" />
      </div>
    );
  }
  if (item.type === 'presence') {
    const isReappear = item.event_type === 'reappeared';
    return (
      <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${
        isReappear ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'
      }`}>
        {isReappear ? <Eye className="h-3.5 w-3.5 text-emerald-300" /> : <EyeOff className="h-3.5 w-3.5 text-red-300" />}
      </div>
    );
  }
  return (
    <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-navy-900 border border-navy-800">
      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}

function ActivityHeader({ item }: { item: ActivityItem }) {
  if (item.type === 'decision') {
    return <span className="text-[11px] uppercase tracking-wider font-semibold text-gold-500">{item.decision_type}</span>;
  }
  if (item.type === 'presence') {
    return <span className={`text-[11px] uppercase tracking-wider font-semibold ${item.event_type === 'reappeared' ? 'text-emerald-300' : 'text-red-300'}`}>
      {item.event_type === 'reappeared' ? 'Reappeared' : 'Disappeared'}
    </span>;
  }
  return <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{item.field_name}</span>;
}

function ActivityBody({ item }: { item: ActivityItem }) {
  if (item.type === 'field_change') {
    return (
      <div className="flex items-center gap-2 text-xs mt-0.5">
        <span className="text-navy-600 line-through truncate max-w-[40%]">{fmtValue(item.old_value)}</span>
        <ArrowRight className="h-3 w-3 text-navy-600 shrink-0" />
        <span className="text-white truncate max-w-[40%]">{fmtValue(item.new_value)}</span>
      </div>
    );
  }
  if (item.type === 'decision' && (item.reason_code || item.reason_text)) {
    return (
      <p className="text-xs text-navy-600 mt-0.5">
        {item.reason_code && <span className="text-slate-400">{item.reason_code}</span>}
        {item.reason_code && item.reason_text && <span> · </span>}
        {item.reason_text && <span className="italic">{item.reason_text}</span>}
      </p>
    );
  }
  return null;
}
