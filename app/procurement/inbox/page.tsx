'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Inbox, Check, Plus, SkipForward, HelpCircle, Eye, RotateCcw,
  Trash2, AlertTriangle, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SupabaseSessionProvider';
import { STAGE_CONFIG, TENDER_STAGES, ARCHIVE_REASON_CODES, ARCHIVE_REASON_LABELS, type TenderStage, type ArchiveReasonCode } from '@/lib/tender/types';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementStageBadge } from '@/components/procurement/ProcurementStageBadge';

type InboxKind = 'ambiguous_match' | 'ambiguous_stage' | 'missing_decision' | 'resurfaced_skip' | 'proposed_pending';

interface InboxItem {
  kind: InboxKind;
  id: string;
  agency: string;
  description: string | null;
  upload_id?: string | null;
  candidates?: Array<{
    tender_id: string;
    score: number;
    snapshot: { id: string; description: string; agency: string; stage: string } | null;
  }>;
  tender_id?: string;
  stage?: string | null;
  proposed_decision_type?: string;
  proposed_reason_code?: string | null;
  created_at: string;
}

const KIND_META: Record<InboxKind, { label: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ambiguous_match:   { label: 'Ambiguous match',  color: 'text-amber-300',  bg: 'bg-amber-500/5',  border: 'border-amber-500/30',  Icon: Inbox },
  ambiguous_stage:   { label: 'Missing stage',    color: 'text-sky-300',    bg: 'bg-sky-500/5',    border: 'border-sky-500/30',    Icon: HelpCircle },
  missing_decision:  { label: 'Missing tender',   color: 'text-red-300',    bg: 'bg-red-500/5',    border: 'border-red-500/30',    Icon: Eye },
  resurfaced_skip:   { label: 'Resurfaced skip',  color: 'text-violet-300', bg: 'bg-violet-500/5', border: 'border-violet-500/30', Icon: Clock },
  proposed_pending:  { label: 'Proposed',         color: 'text-gold-500',   bg: 'bg-gold-500/5',   border: 'border-gold-500/30',   Icon: AlertTriangle },
};

const SKIP_REASONS = [
  { value: 'defer', label: 'Defer (resurfaces next upload)' },
  { value: 'header_or_subtotal', label: 'Header or subtotal (permanent)' },
  { value: 'not_a_tender', label: 'Not a tender (permanent)' },
  { value: 'agency_error', label: 'Agency error (permanent)' },
] as const;
type SkipReason = typeof SKIP_REASONS[number]['value'];

const MATCH_REASONS = [
  { value: 'supersedes', label: 'Supersedes (fold in)' },
  { value: 'duplicates', label: 'Duplicate (drop)' },
] as const;
type MatchReason = typeof MATCH_REASONS[number]['value'];

const MISSING_TRANSITIONS = [
  { value: 'withdrawn', label: 'Withdrawn', Icon: XCircle, color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  { value: 'completed_outside_psip', label: 'Completed (off PSIP)', Icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { value: 'agency_error', label: 'Agency error', Icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
] as const;

export default function InboxPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InboxKind | ''>('');
  const [stageChoices, setStageChoices] = useState<Record<string, TenderStage>>({});
  const [skipReasons, setSkipReasons] = useState<Record<string, SkipReason>>({});
  const [matchReasons, setMatchReasons] = useState<Record<string, MatchReason>>({});
  const [archivePicker, setArchivePicker] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState<ArchiveReasonCode>('withdrawn');

  const isDg = session?.user?.role === 'superadmin';

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/inbox');
    if (res.ok) {
      const data = await res.json();
      setItems(data.items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const out: Record<InboxKind, number> = {
      ambiguous_match: 0, ambiguous_stage: 0, missing_decision: 0,
      resurfaced_skip: 0, proposed_pending: 0,
    };
    for (const i of items) out[i.kind]++;
    return out;
  }, [items]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const reviewSkip = async (id: string) => {
    const reason = skipReasons[id] || 'defer';
    const res = await fetch(`/api/procurement/review/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip', reason_code: reason }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success('Skipped');
    removeItem(id);
  };

  const reviewMatch = async (id: string, tenderId: string) => {
    const reason = matchReasons[id] || 'supersedes';
    const res = await fetch(`/api/procurement/review/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'match', tender_id: tenderId, reason_code: reason }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success('Matched');
    removeItem(id);
  };

  const reviewCreate = async (id: string, stage?: TenderStage) => {
    const res = await fetch(`/api/procurement/review/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', stage }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success('Created');
    removeItem(id);
  };

  const missingResurrect = async (tenderId: string) => {
    const res = await fetch('/api/procurement/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender_id: tenderId, action: 'resurrect' }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success('Resurrected (now sticky-tracked)');
    removeItem(tenderId);
  };

  const missingTransition = async (tenderId: string, targetStatus: string) => {
    const res = await fetch(`/api/procurement/${tenderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_status: targetStatus }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success(`Marked ${targetStatus}`);
    removeItem(tenderId);
  };

  const missingArchive = async (tenderId: string) => {
    const res = await fetch('/api/procurement/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tender_id: tenderId, action: 'archive', reason_code: archiveReason }),
    });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Failed'); return; }
    toast.success('Archived');
    removeItem(tenderId);
    setArchivePicker(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Inbox className="h-5 w-5 text-gold-500" /> Decisions Required
          </h1>
          <p className="text-xs md:text-sm text-navy-600">One inbox for everything that needs a human call. Filter by kind; act inline.</p>
        </div>
        <Link href="/procurement/activity" className="text-xs text-navy-600 hover:text-white transition-colors">Activity →</Link>
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
          {(Object.keys(KIND_META) as InboxKind[]).map((k) => {
            const m = KIND_META[k];
            if (counts[k] === 0) return null;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === k ? `${m.bg} ${m.color} ${m.border}` : 'bg-navy-900 text-slate-400 border-navy-800 hover:border-navy-700'
                }`}
              >
                {m.label} ({counts[k]})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">{items.length === 0 ? 'Inbox is empty.' : 'No items match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const m = KIND_META[item.kind];
            return (
              <div key={`${item.kind}-${item.id}`} className={`rounded-xl border ${m.border} ${m.bg} p-4`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${m.bg} ${m.border} border`}>
                    <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <span className={`text-[11px] uppercase tracking-wider font-semibold ${m.color}`}>{m.label}</span>
                      <AgencyBadge agency={item.agency} />
                      {item.stage && <ProcurementStageBadge stage={item.stage as TenderStage} size="sm" />}
                    </div>
                    {item.description && <p className="text-sm text-white">{item.description}</p>}
                    {item.kind === 'proposed_pending' && (
                      <p className="text-xs text-navy-600 mt-1">
                        {item.proposed_decision_type}{item.proposed_reason_code ? ` · ${item.proposed_reason_code}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {(item.kind === 'ambiguous_match' || item.kind === 'resurfaced_skip') && (
                  <AmbiguousMatchActions
                    item={item}
                    matchReason={matchReasons[item.id] || 'supersedes'}
                    onMatchReason={(v) => setMatchReasons((p) => ({ ...p, [item.id]: v }))}
                    skipReason={skipReasons[item.id] || 'defer'}
                    onSkipReason={(v) => setSkipReasons((p) => ({ ...p, [item.id]: v }))}
                    onMatch={(tid) => reviewMatch(item.id, tid)}
                    onCreate={() => reviewCreate(item.id)}
                    onSkip={() => reviewSkip(item.id)}
                  />
                )}

                {item.kind === 'ambiguous_stage' && (
                  <AmbiguousStageActions
                    item={item}
                    stage={stageChoices[item.id] || ''}
                    onStage={(v) => setStageChoices((p) => ({ ...p, [item.id]: v }))}
                    skipReason={skipReasons[item.id] || 'defer'}
                    onSkipReason={(v) => setSkipReasons((p) => ({ ...p, [item.id]: v }))}
                    onCreate={(s) => reviewCreate(item.id, s)}
                    onSkip={() => reviewSkip(item.id)}
                  />
                )}

                {item.kind === 'missing_decision' && item.tender_id && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => missingResurrect(item.tender_id!)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                        title="Sticky tracking on. Subsequent absences will not flag this tender again."
                      >
                        <RotateCcw className="h-3 w-3" /> Resurrect (sticky)
                      </button>
                      {MISSING_TRANSITIONS.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => missingTransition(item.tender_id!, t.value)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${t.bg} ${t.color} ${t.border} border hover:opacity-80 transition-opacity`}
                        >
                          <t.Icon className="h-3 w-3" /> {t.label}
                        </button>
                      ))}
                      {isDg && (
                        <button
                          onClick={() => setArchivePicker(item.tender_id!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" /> Archive…
                        </button>
                      )}
                    </div>
                    {archivePicker === item.tender_id && (
                      <div className="rounded-lg border border-red-500/30 bg-navy-900 p-3 space-y-2">
                        <p className="text-xs font-medium text-white">Archive reason</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {ARCHIVE_REASON_CODES.map((code) => (
                            <label key={code} className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                              <input type="radio" name={`archive-${item.tender_id}`} value={code} checked={archiveReason === code} onChange={() => setArchiveReason(code)} className="accent-gold-500" />
                              {ARCHIVE_REASON_LABELS[code]}
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setArchivePicker(null)} className="text-xs text-navy-600 hover:text-white px-2 py-1">Cancel</button>
                          <button onClick={() => missingArchive(item.tender_id!)} className="text-xs text-red-400 border border-red-500/30 hover:bg-red-500/20 px-3 py-1 rounded-lg">Confirm archive</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {item.kind === 'proposed_pending' && (
                  <p className="text-xs text-navy-600">Approval gates surface here once the Phase 3 flow ships.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AmbiguousMatchActions({
  item, matchReason, onMatchReason, skipReason, onSkipReason, onMatch, onCreate, onSkip,
}: {
  item: InboxItem;
  matchReason: MatchReason;
  onMatchReason: (v: MatchReason) => void;
  skipReason: SkipReason;
  onSkipReason: (v: SkipReason) => void;
  onMatch: (tid: string) => void;
  onCreate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Candidates</span>
        <select value={matchReason} onChange={(e) => onMatchReason(e.target.value as MatchReason)} className="px-2 py-1 bg-navy-950 border border-navy-800 rounded-md text-[11px] text-slate-300 focus:outline-none focus:border-navy-700">
          {MATCH_REASONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      {(item.candidates ?? []).length === 0 && <div className="text-xs text-navy-600">(no candidates)</div>}
      <div className="space-y-1.5">
        {(item.candidates ?? []).map((c) => {
          if (!c.snapshot) return null;
          return (
            <div key={c.tender_id} className="flex items-center justify-between gap-3 bg-navy-900/50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-300 truncate">{c.snapshot.description}</div>
                <div className="text-[10px] text-navy-600">{c.snapshot.agency} · {c.snapshot.stage} · score {c.score.toFixed(2)}</div>
              </div>
              <button onClick={() => onMatch(c.tender_id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
                <Check className="h-3 w-3" /> Match
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
          <Plus className="h-3 w-3" /> Create new
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <select value={skipReason} onChange={(e) => onSkipReason(e.target.value as SkipReason)} className="px-2 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-navy-700">
            {SKIP_REASONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={onSkip} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-navy-800 hover:border-navy-700 transition-colors">
            <SkipForward className="h-3 w-3" /> Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function AmbiguousStageActions({
  item, stage, onStage, skipReason, onSkipReason, onCreate, onSkip,
}: {
  item: InboxItem;
  stage: TenderStage | '';
  onStage: (v: TenderStage) => void;
  skipReason: SkipReason;
  onSkipReason: (v: SkipReason) => void;
  onCreate: (s: TenderStage) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-center flex-wrap gap-2">
      <label className="text-xs text-slate-400">Assign stage:</label>
      <select value={stage} onChange={(e) => onStage(e.target.value as TenderStage)} className="px-2.5 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-white focus:outline-none focus:border-gold-500/40">
        <option value="">Select stage</option>
        {TENDER_STAGES.map((s) => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
      </select>
      <button onClick={() => stage && onCreate(stage as TenderStage)} disabled={!stage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <Plus className="h-3 w-3" /> Create with stage
      </button>
      <div className="flex items-center gap-1 ml-auto">
        <select value={skipReason} onChange={(e) => onSkipReason(e.target.value as SkipReason)} className="px-2 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-navy-700">
          {SKIP_REASONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={onSkip} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-navy-800 hover:border-navy-700 transition-colors">
          <SkipForward className="h-3 w-3" /> Skip
        </button>
      </div>
    </div>
  );
}
