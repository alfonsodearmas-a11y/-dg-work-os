'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft, CalendarClock, Radio, X } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtGuyanaDate, fmtGuyanaDateTime } from '@/lib/format';
import { isSubstantive } from '@/lib/direct-outreach/compute';
import { canAssignOutreachCase } from '@/lib/direct-outreach/permissions';
import { OUTREACH_AGENCIES } from '@/lib/direct-outreach/types';
import type { OutreachCaseDetail, OutreachTransfer, OutreachUpdate } from '@/lib/direct-outreach/types';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
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
}

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

  const transferTarget = transferForm.caseId === caseId ? transferForm.target : '';
  const transferReason = transferForm.caseId === caseId ? transferForm.reason : '';
  const assignError = assignErrorState?.caseId === caseId ? assignErrorState.message : null;
  const transferError = transferErrorState?.caseId === caseId ? transferErrorState.message : null;

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

  // Load the assignable-user list once per case when the viewer can assign.
  useEffect(() => {
    if (!c || !canAssign) return;
    let cancelled = false;
    setAssignableUsers(null);
    fetch(`/api/tasks/users?agency=${encodeURIComponent(c.effective_agency ?? '')}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load users'))))
      .then((data: { users: AssignableUser[] }) => {
        if (cancelled) return;
        setAssignableUsers((data.users ?? []).filter((u) => u.role !== 'system'));
      })
      .catch(() => {
        if (!cancelled) setAssignableUsers([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.case_id, c?.effective_agency, canAssign]);

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
          {/* Status strip */}
          <div className="flex flex-wrap items-center gap-2">
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

          {/* Issue description */}
          {c.description && (
            <div className="card-premium p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-2">
                Reported issue
              </p>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.description}</p>
            </div>
          )}

          {/* Responsible officer */}
          <div className="card-premium p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-3">
              Responsible officer
            </p>
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

            {canAssign && (
              <div className="mt-3">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleAssign(e.target.value);
                  }}
                  disabled={savingAssignee || assignableUsers === null}
                  className="input-premium w-full text-sm disabled:opacity-60"
                  aria-label="Assign officer"
                >
                  <option value="">
                    {assignableUsers === null
                      ? 'Loading officers…'
                      : c.assignee_user_id
                        ? 'Reassign to…'
                        : 'Assign an officer…'}
                  </option>
                  {(assignableUsers ?? [])
                    .filter((u) => u.id !== c.assignee_user_id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.id}{u.agency ? ` (${u.agency})` : u.role === 'superadmin' ? ' (Ministry)' : ''}
                      </option>
                    ))}
                </select>
                {assignError && <p className="text-red-400 text-xs mt-2">{assignError}</p>}
              </div>
            )}
          </div>

          {/* Agency transfer (superadmin) */}
          {(isSuperadmin || current.transfers.length > 0) && (
            <div className="card-premium p-4">
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

          {/* Metadata */}
          <div className="card-premium p-4 grid grid-cols-2 gap-4">
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
              <span className="tabular-nums">{c.comment_count}</span>
            </MetaField>
            <MetaField label="Days open">
              <span className="tabular-nums">{c.days_open == null ? '—' : `${c.days_open}d`}</span>
            </MetaField>
            <MetaField label="Days idle">
              <span className={`tabular-nums font-semibold ${idleColorClass(c.days_idle)}`}>
                {c.days_idle == null ? '—' : `${c.days_idle}d`}
              </span>
            </MetaField>
          </div>

          {/* Auto-detected target date */}
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
                  <p className="text-2xl font-bold text-white tabular-nums">{fmtDate(c.committed_date)}</p>
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
              </>
            ) : (
              <p className="text-xs text-navy-600 italic">
                No completion or target date detected in the comment history.
              </p>
            )}
          </div>

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
        </div>
      )}
    </SlidePanel>
  );
}
