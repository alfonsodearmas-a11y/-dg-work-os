'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft, CalendarClock, ClipboardList, Pencil, Radio, UserCircle2, X } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { MultiSelect } from '@/components/oversight/shared';
import { Badge } from '@/components/ui/Badge';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtGuyanaDate, fmtGuyanaDateTime } from '@/lib/format';
import { isSubstantive } from '@/lib/direct-outreach/compute';
import { canAssignOutreachCase, canPostOutreachUpdate } from '@/lib/direct-outreach/permissions';
import {
  OUTREACH_AGENCIES,
  OUTREACH_WORKING_STATUSES,
  OUTREACH_WORKING_STATUS_LABELS,
} from '@/lib/direct-outreach/types';
import type {
  OutreachCaseDetail,
  OutreachCaseState,
  OutreachOfficerUpdate,
  OutreachTransfer,
  OutreachUpdate,
  OutreachWorkingStatus,
} from '@/lib/direct-outreach/types';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import type { MentionUser } from '@/components/tasks/MentionAutocomplete';
import { OfficerUpdates } from './OfficerUpdates';
import { OUTREACH_STATUS_VARIANTS, idleColorClass, initials, outreachAgencyColor } from './shared';

interface CaseDetailPanelProps {
  caseId: number | null;
  onClose: () => void;
  /** Called after an assignment or transfer so the list/summary can refresh. */
  onChanged?: () => void;
}

interface CaseDetailResponse {
  case: OutreachCaseDetail;
  updates: OutreachUpdate[];
  transfers: OutreachTransfer[];
  officer_updates: OutreachOfficerUpdate[];
  state: OutreachCaseState;
}

// Per-status ACTIVE pill classes (inactive pills share the muted treatment).
const STATUS_PILL_ACTIVE: Record<OutreachWorkingStatus, string> = {
  not_started: 'bg-navy-800 text-slate-300 border-navy-600',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
  blocked: 'bg-red-500/15 text-red-400 border-red-500/40',
  resolved_pending_verification: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
};

interface AssignableUser {
  id: string;
  name: string | null;
  role: string;
  agency: string | null;
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">{label}</p>
      <div className="text-sm text-slate-200 mt-0.5">{children}</div>
    </div>
  );
}

export function CaseDetailPanel({ caseId, onClose, onChanged }: CaseDetailPanelProps) {
  const { effectiveUser } = useEffectiveUser();
  const isSuperadmin = effectiveUser.role === 'superadmin';

  // Results are keyed by the caseId they were fetched for, so switching cases
  // self-invalidates without synchronous setState calls inside the effect.
  const [detail, setDetail] = useState<{ caseId: number; data: CaseDetailResponse } | null>(null);
  const [fetchError, setFetchError] = useState<{ caseId: number; message: string } | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);

  // Officer assignment — errors keyed by caseId so they don't leak across cases.
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[] | null>(null);
  // Superadmin picker: EVERY active human user (any agency/role), fetched once
  // per panel lifetime — a superadmin may assign anyone as responsible officer.
  const [allOfficers, setAllOfficers] = useState<AssignableUser[] | null>(null);
  // Officer-list fetch failures disable the picker and offer a retry — a
  // failed fetch must never present as an empty (assignable-to-nobody) picker.
  const [allOfficersError, setAllOfficersError] = useState(false);
  const [assignableError, setAssignableError] = useState(false);
  const [officerRetry, setOfficerRetry] = useState(0);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [assignErrorState, setAssignErrorState] = useState<{ caseId: number; message: string } | null>(null);

  // Transfer form — keyed by caseId (the panel never remounts across case
  // switches, so unkeyed state would leak a half-typed reason to the next case).
  const [transferForm, setTransferForm] = useState<{ caseId: number | null; target: string; reason: string }>({
    caseId: null,
    target: '',
    reason: '',
  });
  const [transferring, setTransferring] = useState(false);
  const [transferErrorState, setTransferErrorState] = useState<{ caseId: number; message: string } | null>(null);

  // Progress & commitment (v3) — status pill save + target-date editor, both
  // keyed by caseId so half-typed state never leaks across case switches.
  const [savingStatus, setSavingStatus] = useState(false);
  const [targetForm, setTargetForm] = useState<{ caseId: number | null; editing: boolean; value: string }>({
    caseId: null,
    editing: false,
    value: '',
  });
  const [savingTarget, setSavingTarget] = useState(false);
  const [postErrorState, setPostErrorState] = useState<{ caseId: number; message: string } | null>(null);
  // Optimistic overrides after a successful post: the detail refetch is async,
  // so without these the pills/buttons re-enable against STALE server state and
  // a second click appends a duplicate row to the permanent log. Cleared when
  // the refetch lands (keyed by caseId so they never leak across cases).
  // `target` uses undefined = no override, null = cleared.
  const [optimistic, setOptimistic] = useState<{
    caseId: number;
    status?: OutreachWorkingStatus;
    target?: string | null;
  } | null>(null);

  const transferTarget = transferForm.caseId === caseId ? transferForm.target : '';
  const transferReason = transferForm.caseId === caseId ? transferForm.reason : '';
  const assignError = assignErrorState?.caseId === caseId ? assignErrorState.message : null;
  const transferError = transferErrorState?.caseId === caseId ? transferErrorState.message : null;
  const postError = postErrorState?.caseId === caseId ? postErrorState.message : null;
  const targetEditing = targetForm.caseId === caseId && targetForm.editing;
  const targetValue = targetForm.caseId === caseId ? targetForm.value : '';

  useEffect(() => {
    if (caseId === null) return;
    let cancelled = false;
    fetch(`/api/direct-outreach/${caseId}`)
      .then(async (res) => {
        if (!res.ok) {
          const message = await res
            .json()
            .then((body) => body?.error as string | undefined)
            .catch(() => undefined);
          throw new Error(message || 'Failed to load case');
        }
        return res.json();
      })
      .then((data: CaseDetailResponse) => {
        if (cancelled) return;
        setDetail({ caseId, data });
        setFetchError((prev) => (prev?.caseId === caseId ? null : prev));
        // Fresh server state supersedes any optimistic override for this case.
        setOptimistic((prev) => (prev?.caseId === caseId ? null : prev));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setFetchError({ caseId, message: err.message });
        setDetail((prev) => (prev?.caseId === caseId ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, reloadSeq]);

  const current = detail?.caseId === caseId ? detail.data : null;
  const error = fetchError?.caseId === caseId ? fetchError.message : null;
  const loading = caseId !== null && !current && !error;
  const c = current?.case;

  // Null effective_agency (workbook row without an agency) would make the
  // picker fetch /api/tasks/users?agency= → ALL users; disable assignment.
  const canAssign = c && c.effective_agency
    ? canAssignOutreachCase(effectiveUser.role, effectiveUser.agency, c.effective_agency)
    : false;

  // Progress updates / working status / target date (v3): the assigned officer
  // too, even without assign rights. Rendered on effectiveUser (ViewAs-aware);
  // the route re-authorizes on the real session.
  const canPost = c
    ? canPostOutreachUpdate(
        effectiveUser.role,
        effectiveUser.id,
        effectiveUser.agency,
        c.effective_agency,
        c.assignee_user_id,
      )
    : false;

  // Load the case-agency user list once per case when the viewer can assign
  // (picker) or post (mention autocomplete) — one fetch feeds both. The
  // effective_agency guard keeps a null-agency case (where a superadmin or the
  // assignee can still post) from fetching ?agency= → ALL users, whose
  // out-of-scope mentions the server would silently drop anyway.
  useEffect(() => {
    if (!c || !c.effective_agency || (!canAssign && !canPost)) return;
    let cancelled = false;
    setAssignableUsers(null);
    setAssignableError(false);
    fetch(`/api/tasks/users?agency=${encodeURIComponent(c.effective_agency ?? '')}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load users'))))
      .then((data: { users: AssignableUser[] }) => {
        if (cancelled) return;
        setAssignableUsers((data.users ?? []).filter((u) => u.role !== 'system'));
      })
      .catch(() => {
        if (cancelled) return;
        setAssignableUsers([]);
        setAssignableError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.case_id, c?.effective_agency, canAssign, canPost, officerRetry]);

  // Superadmin assign picker: the full human user list (any agency, any role).
  // Case-independent, so one fetch serves every case this panel opens.
  useEffect(() => {
    if (!isSuperadmin || caseId === null || allOfficers !== null) return;
    let cancelled = false;
    setAllOfficersError(false);
    fetch('/api/direct-outreach/officers')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load officers'))))
      .then((data: { users: AssignableUser[] }) => {
        if (!cancelled) setAllOfficers(data.users ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllOfficersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin, caseId, allOfficers, officerRetry]);

  const retryOfficerFetch = () => {
    setAllOfficersError(false);
    setAssignableError(false);
    setOfficerRetry((n) => n + 1);
  };

  const reload = () => setReloadSeq((s) => s + 1);

  const handleAssign = async (assigneeUserId: string | null) => {
    if (caseId === null) return;
    setSavingAssignee(true);
    setAssignErrorState(null);
    try {
      const res = await fetch(`/api/direct-outreach/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee_user_id: assigneeUserId }),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((body) => body?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(message || 'Failed to update assignment');
      }
      reload();
      onChanged?.();
    } catch (err) {
      setAssignErrorState({
        caseId,
        message: err instanceof Error ? err.message : 'Failed to update assignment',
      });
    } finally {
      setSavingAssignee(false);
    }
  };

  const handleTransfer = async () => {
    if (caseId === null || !transferTarget || !transferReason.trim()) return;
    setTransferring(true);
    setTransferErrorState(null);
    try {
      const res = await fetch(`/api/direct-outreach/${caseId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_agency: transferTarget, reason: transferReason.trim() }),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((body) => body?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(message || 'Transfer failed');
      }
      setTransferForm({ caseId: null, target: '', reason: '' });
      reload();
      onChanged?.();
    } catch (err) {
      setTransferErrorState({
        caseId,
        message: err instanceof Error ? err.message : 'Transfer failed',
      });
    } finally {
      setTransferring(false);
    }
  };

  // One POST endpoint carries remarks, working-status changes, and target-date
  // set/clear (appended to the permanent officer log server-side).
  const postUpdate = async (payload: {
    body?: string;
    working_status?: OutreachWorkingStatus;
    target_date?: string | null;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (caseId === null) return { ok: false, error: 'No case selected' };
    setPostErrorState(null);
    try {
      const res = await fetch(`/api/direct-outreach/${caseId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((b) => b?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(message || 'Failed to post update');
      }
      reload();
      onChanged?.();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post update';
      setPostErrorState({ caseId, message });
      return { ok: false, error: message };
    }
  };

  // Displayed state = optimistic override (post landed, refetch in flight) or server truth.
  const displayedStatus =
    optimistic?.caseId === caseId && optimistic.status !== undefined
      ? optimistic.status
      : current?.state.working_status;
  const displayedTarget =
    optimistic?.caseId === caseId && optimistic.target !== undefined
      ? optimistic.target
      : current?.state.target_date ?? null;

  const handleStatusChange = async (status: OutreachWorkingStatus) => {
    if (savingStatus || caseId === null || !current || displayedStatus === status) return;
    setSavingStatus(true);
    try {
      const res = await postUpdate({ working_status: status });
      if (res.ok) setOptimistic((prev) => ({ caseId, ...(prev?.caseId === caseId ? prev : {}), status }));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleTargetSave = async () => {
    if (savingTarget || caseId === null || !targetValue) return;
    setSavingTarget(true);
    try {
      const res = await postUpdate({ target_date: targetValue });
      if (res.ok) {
        setOptimistic((prev) => ({ caseId, ...(prev?.caseId === caseId ? prev : {}), target: targetValue }));
        setTargetForm({ caseId, editing: false, value: '' });
      }
    } finally {
      setSavingTarget(false);
    }
  };

  const handleTargetClear = async () => {
    if (savingTarget || caseId === null) return;
    setSavingTarget(true);
    try {
      const res = await postUpdate({ target_date: null });
      if (res.ok) setOptimistic((prev) => ({ caseId, ...(prev?.caseId === caseId ? prev : {}), target: null }));
    } finally {
      setSavingTarget(false);
    }
  };

  const mentionUsers: MentionUser[] = (assignableUsers ?? []).map((u) => ({
    id: u.id,
    name: u.name ?? 'Unknown',
    role: u.role,
    agency: u.agency,
  }));

  return (
    <SlidePanel
      isOpen={caseId !== null}
      onClose={onClose}
      title={caseId !== null ? `Case #${caseId}` : ''}
      subtitle={c?.client_name || undefined}
      icon={Radio}
      accentColor="from-[#d4af37] to-[#b8860b]"
    >
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      )}

      {error && !loading && (
        <div className="card-premium p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {c && current && !loading && (
        <div className="space-y-6">
          {/* Action region — working status, responsible officer, target date */}
          <div className={`card-premium p-4 ${canPost || canAssign ? 'border-l-2 border-l-gold-500/40' : ''}`}>
            {/* OP status / priority display */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant={OUTREACH_STATUS_VARIANTS[c.status ?? ''] ?? 'default'}>
                {c.status ?? 'Unknown'}
              </Badge>
              {c.priority_flag === 'Elevated' && <Badge variant="danger">HIGH</Badge>}
              {c.transferred && <Badge variant="warning">TRANSFERRED</Badge>}
              <Badge variant="gold">{c.theme ?? 'Other'}</Badge>
              <span
                className="font-mono font-semibold text-xs tracking-wider ml-auto"
                style={{ color: outreachAgencyColor(c.effective_agency) }}
                title={c.transferred ? `Workbook agency: ${c.agency ?? 'unknown'}` : undefined}
              >
                {c.effective_agency ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={14} className={canPost ? 'text-gold-500' : 'text-navy-600'} aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
                Progress &amp; commitment
              </p>
            </div>

            {canPost ? (
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Working status">
                {OUTREACH_WORKING_STATUSES.map((s) => {
                  const active = displayedStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleStatusChange(s)}
                      disabled={savingStatus}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${
                        active
                          ? STATUS_PILL_ACTIVE[s]
                          : 'bg-navy-900/60 text-slate-400 border-navy-800 hover:border-gold-500/40 hover:text-gold-500'
                      }`}
                    >
                      {OUTREACH_WORKING_STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Badge variant={
                displayedStatus === 'blocked' ? 'danger'
                  : displayedStatus === 'in_progress' ? 'info'
                    : displayedStatus === 'resolved_pending_verification' ? 'success'
                      : 'default'
              }>
                {OUTREACH_WORKING_STATUS_LABELS[displayedStatus ?? 'not_started']}
              </Badge>
            )}
            {current.state.updated_at && (
              <p className="text-[11px] text-navy-600 mt-2">
                set by {current.state.updated_by_name ?? 'Former user'} · {fmtGuyanaDate(current.state.updated_at)}
              </p>
            )}

            {/* Officer + target date — stacked below sm, side-by-side from sm up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-navy-800/40">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserCircle2 size={14} className={canAssign ? 'text-gold-500' : 'text-navy-600'} aria-hidden="true" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
                    Responsible officer
                  </p>
                </div>
                {c.assignee_user_id ? (
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                      {initials(c.assignee_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{c.assignee_name ?? 'Unknown'}</p>
                      <p className="text-[11px] text-navy-600">
                        {c.assignee_agency ? `${c.assignee_agency} · ` : ''}assigned {fmtGuyanaDate(c.assigned_at)}
                      </p>
                    </div>
                    {canAssign && (
                      <button
                        type="button"
                        onClick={() => handleAssign(null)}
                        disabled={savingAssignee}
                        className="p-1.5 rounded-lg text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                        aria-label="Unassign officer"
                        title="Unassign"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-navy-600 italic">Unassigned</p>
                )}

                {canAssign && (() => {
                  // Superadmins pick from EVERY human user; managers keep the
                  // case-agency list (locked Q3). Both label "Name (Agency)" with
                  // a Ministry fallback for agency-less superadmins.
                  const pickerUsers = isSuperadmin ? allOfficers : assignableUsers;
                  const pickerFailed = isSuperadmin ? allOfficersError : assignableError;
                  return (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-500/80 mb-1.5">
                        Assign
                      </p>
                      <MultiSelect
                        label={
                          pickerUsers === null && !pickerFailed
                            ? 'Loading officers…'
                            : c.assignee_user_id
                              ? 'Reassign to…'
                              : 'Assign an officer…'
                        }
                        options={(pickerUsers ?? [])
                          .filter((u) => u.id !== c.assignee_user_id)
                          .map((u) => ({
                            value: u.id,
                            label: `${u.name ?? u.id}${u.agency ? ` (${u.agency})` : u.role === 'superadmin' ? ' (Ministry)' : ''}`,
                          }))}
                        selected={[]}
                        onChange={(vals) => {
                          // Single-select adapter: hand the picked id to the existing
                          // assignment handler unchanged (same PATCH payload as before).
                          const picked = vals[vals.length - 1];
                          if (picked) handleAssign(picked);
                        }}
                        closeOnSelect
                        disabled={savingAssignee || pickerFailed || pickerUsers === null}
                      />
                      {pickerFailed && (
                        <p className="text-red-400 text-xs mt-2" role="alert">
                          Failed to load the officer list.{' '}
                          <button
                            type="button"
                            onClick={retryOfficerFetch}
                            className="underline hover:text-white transition-colors"
                          >
                            Retry
                          </button>
                        </p>
                      )}
                      {assignError && <p className="text-red-400 text-xs mt-2">{assignError}</p>}
                    </div>
                  );
                })()}
              </div>

              <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-2">
                Officer target date
              </p>
              {displayedTarget && !targetEditing ? (
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-white tabular-nums">{fmtDate(displayedTarget)}</p>
                  {c.officer_target_overdue && <Badge variant="danger">OVERDUE</Badge>}
                  {canPost && (
                    <span className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() => setTargetForm({ caseId, editing: true, value: displayedTarget ?? '' })}
                        disabled={savingTarget}
                        className="p-1.5 rounded-lg text-navy-600 hover:text-gold-500 hover:bg-gold-500/10 transition-colors disabled:opacity-60"
                        aria-label="Edit target date"
                        title="Edit target date"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={handleTargetClear}
                        disabled={savingTarget}
                        className="p-1.5 rounded-lg text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                        aria-label="Clear target date"
                        title="Clear target date"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
              ) : targetEditing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={targetValue}
                    onChange={(e) => setTargetForm({ caseId, editing: true, value: e.target.value })}
                    className="input-premium text-sm"
                    aria-label="Target date"
                  />
                  <button
                    type="button"
                    onClick={handleTargetSave}
                    disabled={!targetValue || savingTarget}
                    className="btn-gold text-xs !py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingTarget ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetForm({ caseId, editing: false, value: '' })}
                    className="text-xs text-navy-600 hover:text-gold-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : canPost ? (
                <button
                  type="button"
                  onClick={() => setTargetForm({ caseId, editing: true, value: '' })}
                  className="btn-navy text-xs !py-1.5 flex items-center gap-1.5"
                >
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  Set target date
                </button>
              ) : (
                <p className="text-xs text-navy-600 italic">No officer commitment yet.</p>
              )}
              </div>
            </div>
            {postError && <p className="text-red-400 text-xs mt-2">{postError}</p>}
          </div>

          {/* Issue description */}
          {c.description && (
            <div className="card-premium p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-2">
                Reported issue
              </p>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.description}</p>
            </div>
          )}

          {/* Agency transfer (superadmin) */}
          {(isSuperadmin || current.transfers.length > 0) && (
            <div className={`card-premium p-4 ${isSuperadmin ? 'border-l-2 border-l-gold-500/40' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft size={14} className="text-amber-400" aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
                  Agency transfer
                </p>
              </div>

              {isSuperadmin && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={transferTarget}
                      onChange={(e) =>
                        setTransferForm({ caseId, target: e.target.value, reason: transferReason })
                      }
                      className="input-premium text-sm"
                      aria-label="Transfer to agency"
                    >
                      <option value="">Transfer to…</option>
                      {OUTREACH_AGENCIES.filter(
                        (a) => a.toUpperCase() !== (c.effective_agency ?? '').toUpperCase(),
                      ).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={transferReason}
                      maxLength={500}
                      onChange={(e) =>
                        setTransferForm({ caseId, target: transferTarget, reason: e.target.value })
                      }
                      placeholder="Reason (required)"
                      className="input-premium flex-1 text-sm"
                      aria-label="Transfer reason"
                    />
                    <button
                      type="button"
                      onClick={handleTransfer}
                      disabled={!transferTarget || !transferReason.trim() || transferring}
                      className="btn-navy text-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transferring ? 'Transferring…' : 'Transfer'}
                    </button>
                  </div>
                  <p className="text-[11px] text-navy-600">
                    Transferring clears the current officer and notifies the receiving agency.
                  </p>
                  {transferError && <p className="text-red-400 text-xs">{transferError}</p>}
                </div>
              )}

              {current.transfers.length > 0 && (
                <ol className={`space-y-2 ${isSuperadmin ? 'mt-4 pt-3 border-t border-navy-800/40' : ''}`}>
                  {current.transfers.map((t: OutreachTransfer) => (
                    <li key={t.id} className="text-xs text-slate-400">
                      <span className="font-mono">{t.from_agency ?? '—'} → {t.to_agency}</span>
                      <span className="text-navy-600"> · {t.transferred_by_name ?? 'Unknown'} · {fmtGuyanaDate(t.transferred_at)}</span>
                      <span className="block text-navy-600 italic mt-0.5">“{t.reason}”</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Officer progress updates (v3 — the writable log) */}
          <OfficerUpdates
            updates={current.officer_updates}
            users={mentionUsers}
            canPost={canPost}
            onSubmit={async (rawBody) => {
              const res = await postUpdate({ body: rawBody });
              return res.ok ? null : res.error ?? 'Failed to post update';
            }}
          />

          {/* Imported comment timeline (read-only) */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-3">
              Imported from OP Direct · read-only ({current.updates.length})
            </p>
            {current.updates.length === 0 ? (
              <p className="text-xs text-navy-600 italic">No history imported for this case yet.</p>
            ) : (
              <ol className="space-y-3">
                {current.updates.map((u) => {
                  const substantive = isSubstantive(u.comment);
                  return (
                    <li
                      key={u.entry_ref}
                      className={`border-l-2 pl-4 ${substantive ? 'border-gold-500/40' : 'border-navy-800'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {u.status && (
                          <Badge variant={OUTREACH_STATUS_VARIANTS[u.status] ?? 'default'}>{u.status}</Badge>
                        )}
                        <span className="text-xs text-slate-400 font-medium">{u.username || 'Unknown'}</span>
                        {u.creator_agency && (
                          <span className="text-[11px] text-navy-600">{u.creator_agency}</span>
                        )}
                        <span className="text-[11px] text-navy-600 ml-auto">
                          {fmtGuyanaDateTime(u.created_at)}
                        </span>
                      </div>
                      <p
                        className={`text-sm mt-1 whitespace-pre-wrap ${
                          substantive ? 'text-slate-200' : 'text-navy-600 italic'
                        }`}
                      >
                        {u.comment || '—'}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Read-only OP Direct metadata — collapsed by default */}
          <CollapsibleSection title="Case details" defaultOpen={false}>
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-4">
                <MetaField label="OP status">
                  <Badge variant={OUTREACH_STATUS_VARIANTS[c.status ?? ''] ?? 'default'}>
                    {c.status ?? 'Unknown'}
                  </Badge>
                </MetaField>
                <MetaField label="Client">{c.client_name || '—'}</MetaField>
                <MetaField label="Phone">{c.client_phone || '—'}</MetaField>
                <MetaField label="Address">{c.client_address || '—'}</MetaField>
                <MetaField label="Category">{c.category_name || c.unclassified_category || '—'}</MetaField>
                <MetaField label="Outreach">{c.outreach_location || '—'}</MetaField>
                <MetaField label="Outreach date">{c.outreach_date || '—'}</MetaField>
                <MetaField label="Region">{c.region || '—'}</MetaField>
                <MetaField label="Workbook point person">{c.point_person || '—'}</MetaField>
                <MetaField label="Logged">{fmtGuyanaDate(c.created_at)}</MetaField>
                <MetaField label="Comments">
                  <span className="font-mono tabular-nums">{c.comment_count}</span>
                </MetaField>
                <MetaField label="Days open">
                  <span className="font-mono tabular-nums">{c.days_open == null ? '—' : `${c.days_open}d`}</span>
                </MetaField>
                <MetaField label="Days idle">
                  <span className={`font-mono tabular-nums font-semibold ${idleColorClass(c.days_idle)}`}>
                    {c.days_idle == null ? '—' : `${c.days_idle}d`}
                  </span>
                </MetaField>
              </div>

              {/* Auto-detected target date (heuristic — display-only) */}
              <div className="card-premium p-4 border border-amber-500/30">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock size={14} className="text-amber-400" aria-hidden="true" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
                      Auto-detected target date
                    </p>
                  </div>
                  <Badge variant="warning">verify</Badge>
                </div>
                {c.committed_date ? (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-2xl font-bold text-white tabular-nums">{fmtDate(c.committed_date)}</p>
                      {c.committed_overdue && <Badge variant="danger">OVERDUE</Badge>}
                    </div>
                    {c.committed_source && (
                      <blockquote className="text-xs text-slate-400 italic mt-3 border-l-2 border-navy-800 pl-3">
                        “{c.committed_source}”
                      </blockquote>
                    )}
                    {c.committed_by && (
                      <p className="text-[11px] text-navy-600 mt-1.5">— {c.committed_by}</p>
                    )}
                    {displayedTarget && (
                      <p className="text-[11px] text-navy-600 mt-2">
                        The officer commitment above supersedes this detection.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-navy-600 italic">
                    No completion or target date detected in the comment history.
                  </p>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </SlidePanel>
  );
}
