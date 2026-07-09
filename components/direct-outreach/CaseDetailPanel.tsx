'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Radio } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtGuyanaDate, fmtGuyanaDateTime } from '@/lib/format';
import { isSubstantive } from '@/lib/direct-outreach/compute';
import type { OutreachCaseDetail, OutreachUpdate } from '@/lib/direct-outreach/types';
import { OUTREACH_STATUS_VARIANTS, idleColorClass, outreachAgencyColor } from './shared';

interface CaseDetailPanelProps {
  caseId: number | null;
  onClose: () => void;
}

interface CaseDetailResponse {
  case: OutreachCaseDetail;
  updates: OutreachUpdate[];
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">{label}</p>
      <div className="text-sm text-slate-200 mt-0.5">{children}</div>
    </div>
  );
}

export function CaseDetailPanel({ caseId, onClose }: CaseDetailPanelProps) {
  // Results are keyed by the caseId they were fetched for, so switching cases
  // self-invalidates without synchronous setState calls inside the effect.
  const [detail, setDetail] = useState<{ caseId: number; data: CaseDetailResponse } | null>(null);
  const [fetchError, setFetchError] = useState<{ caseId: number; message: string } | null>(null);

  useEffect(() => {
    if (caseId === null) return;
    let cancelled = false;
    fetch(`/api/direct-outreach/${caseId}`)
      .then(async (res) => {
        if (!res.ok) {
          // Error bodies may not be JSON (e.g. a gateway error page).
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
        // Success and error are mutually exclusive per case.
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
  }, [caseId]);

  const current = detail?.caseId === caseId ? detail.data : null;
  const error = fetchError?.caseId === caseId ? fetchError.message : null;
  const loading = caseId !== null && !current && !error;
  const c = current?.case;

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
            <Badge variant="gold">{c.theme ?? 'Other'}</Badge>
            <span
              className="font-mono font-semibold text-xs tracking-wider ml-auto"
              style={{ color: outreachAgencyColor(c.agency) }}
            >
              {c.agency ?? '—'}
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

          {/* Metadata */}
          <div className="card-premium p-4 grid grid-cols-2 gap-4">
            <MetaField label="Client">{c.client_name || '—'}</MetaField>
            <MetaField label="Phone">{c.client_phone || '—'}</MetaField>
            <MetaField label="Address">{c.client_address || '—'}</MetaField>
            <MetaField label="Category">{c.category_name || c.unclassified_category || '—'}</MetaField>
            <MetaField label="Outreach">{c.outreach_location || '—'}</MetaField>
            <MetaField label="Outreach date">{c.outreach_date || '—'}</MetaField>
            <MetaField label="Logged">{fmtGuyanaDate(c.created_at)}</MetaField>
            <MetaField label="Logged by">{c.creator || '—'}</MetaField>
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

          {/* Comment timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-3">
              Comment history ({current.updates.length})
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
