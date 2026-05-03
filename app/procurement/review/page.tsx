'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Inbox, Check, Plus, SkipForward, HelpCircle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { STAGE_CONFIG, TENDER_STAGES, type TenderStage } from '@/lib/tender/types';

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

interface ReviewRow {
  id: string;
  upload_id: string;
  review_reason: 'ambiguous_match' | 'ambiguous_stage';
  incoming_row: {
    description?: string;
    agency?: string;
    stage?: string;
    programme_activity?: string | null;
    [k: string]: unknown;
  };
  status: string;
  candidates: Array<{
    tender_id: string;
    score: number;
    snapshot: { id: string; description: string; agency: string; stage: string } | null;
  }>;
}

export default function ReviewPage() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageChoices, setStageChoices] = useState<Record<string, TenderStage>>({});
  const [skipReasons, setSkipReasons] = useState<Record<string, SkipReason>>({});
  const [matchReasons, setMatchReasons] = useState<Record<string, MatchReason>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/procurement/review');
    if (res.ok) {
      const data = await res.json();
      setReviews(data.reviews || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [ambiguousMatches, ambiguousStages] = useMemo(() => {
    const matches: ReviewRow[] = [];
    const stages: ReviewRow[] = [];
    for (const r of reviews) {
      if (r.review_reason === 'ambiguous_stage') stages.push(r);
      else matches.push(r);
    }
    return [matches, stages];
  }, [reviews]);

  const resolve = async (
    id: string,
    action: 'match' | 'create' | 'skip',
    opts: { tenderId?: string; stage?: TenderStage; reasonCode?: string } = {},
  ) => {
    const res = await fetch(`/api/procurement/review/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        tender_id: opts.tenderId,
        stage: opts.stage,
        reason_code: opts.reasonCode,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Failed');
      return;
    }
    toast.success(`Resolved as ${action}`);
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  const skipReasonFor = (id: string): SkipReason => skipReasons[id] || 'defer';
  const matchReasonFor = (id: string): MatchReason => matchReasons[id] || 'supersedes';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/procurement" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            <Inbox className="h-5 w-5 text-gold-500" /> Review Queue
          </h1>
          <p className="text-xs md:text-sm text-navy-600">Ambiguous rows from recent uploads. Skip with a reason, match with a reason, or create.</p>
        </div>
      </div>

      {loading ? (
        <div className="h-20 bg-navy-900 rounded-xl border border-navy-800 animate-pulse" />
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-navy-800 bg-navy-900/40 p-10 text-center">
          <p className="text-sm text-navy-600">No pending review items.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {ambiguousStages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Missing stage ({ambiguousStages.length})</h2>
                <span className="text-xs text-navy-600">Row came in with no stage column and no dates — assign a stage to ingest, or skip.</span>
              </div>
              {ambiguousStages.map((r) => {
                const inc = r.incoming_row;
                const chosen = stageChoices[r.id] || '';
                return (
                  <div key={r.id} className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                    <div className="mb-3">
                      <div className="text-[11px] uppercase tracking-wider text-sky-300 mb-1">Incoming row (stage unknown)</div>
                      <div className="text-sm text-white">{inc.description || '(no description)'}</div>
                      <div className="text-xs text-navy-600 mt-1">
                        {inc.agency} · {inc.programme_activity || '(no activity)'}
                      </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-sky-500/20">
                      <label className="text-xs text-slate-400">Assign stage:</label>
                      <select
                        value={chosen}
                        onChange={(e) => setStageChoices((prev) => ({ ...prev, [r.id]: e.target.value as TenderStage }))}
                        className="px-2.5 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-white focus:outline-none focus:border-gold-500/40"
                      >
                        <option value="">Select stage</option>
                        {TENDER_STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => chosen && resolve(r.id, 'create', { stage: chosen })}
                        disabled={!chosen}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3 w-3" /> Create with stage
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <select
                          value={skipReasonFor(r.id)}
                          onChange={(e) => setSkipReasons((prev) => ({ ...prev, [r.id]: e.target.value as SkipReason }))}
                          className="px-2 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-navy-700"
                        >
                          {SKIP_REASONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => resolve(r.id, 'skip', { reasonCode: skipReasonFor(r.id) })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-navy-800 hover:border-navy-700 transition-colors"
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {ambiguousMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-gold-500" />
                <h2 className="text-sm font-semibold text-white">Ambiguous matches ({ambiguousMatches.length})</h2>
                <span className="text-xs text-navy-600">Fuzzy match below the high-confidence threshold. Pick a candidate with a reason, or create new.</span>
              </div>
              {ambiguousMatches.map((r) => {
                const inc = r.incoming_row;
                return (
                  <div key={r.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="mb-3">
                      <div className="text-[11px] uppercase tracking-wider text-amber-300 mb-1">Incoming row</div>
                      <div className="text-sm text-white">{inc.description || '(no description)'}</div>
                      <div className="text-xs text-navy-600 mt-1">
                        {inc.agency} · {inc.stage} · {inc.programme_activity || '(no activity)'}
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400">Candidates</span>
                        <select
                          value={matchReasonFor(r.id)}
                          onChange={(e) => setMatchReasons((prev) => ({ ...prev, [r.id]: e.target.value as MatchReason }))}
                          className="px-2 py-1 bg-navy-950 border border-navy-800 rounded-md text-[11px] text-slate-300 focus:outline-none focus:border-navy-700"
                        >
                          {MATCH_REASONS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      {r.candidates.length === 0 && <div className="text-xs text-navy-600">(none)</div>}
                      <div className="space-y-2">
                        {r.candidates.map((c) => {
                          const snap = c.snapshot;
                          if (!snap) return null;
                          return (
                            <div key={c.tender_id} className="flex items-center justify-between gap-3 bg-navy-900/50 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-300 truncate">{snap.description}</div>
                                <div className="text-[10px] text-navy-600">{snap.agency} · {snap.stage} · score {c.score.toFixed(2)}</div>
                              </div>
                              <button
                                onClick={() => resolve(r.id, 'match', { tenderId: c.tender_id, reasonCode: matchReasonFor(r.id) })}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                              >
                                <Check className="h-3 w-3" /> Match
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
                      <button
                        onClick={() => resolve(r.id, 'create')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Create new
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <select
                          value={skipReasonFor(r.id)}
                          onChange={(e) => setSkipReasons((prev) => ({ ...prev, [r.id]: e.target.value as SkipReason }))}
                          className="px-2 py-1.5 bg-navy-950 border border-navy-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-navy-700"
                        >
                          {SKIP_REASONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => resolve(r.id, 'skip', { reasonCode: skipReasonFor(r.id) })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-navy-800 hover:border-navy-700 transition-colors"
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
