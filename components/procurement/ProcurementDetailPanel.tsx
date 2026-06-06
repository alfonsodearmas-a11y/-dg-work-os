'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from '@/components/providers/SupabaseSessionProvider';
import {
  Package, MessageSquare, Send, FileText, Upload, Download,
  ArrowRight, Trash2, Loader2, History, Repeat, AlertTriangle, Award, HelpCircle,
  Eye, EyeOff,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { AgencyBadge } from './AgencyBadge';
import { ProcurementStageIndicator } from './ProcurementStageIndicator';
import { ProcurementStageBadge } from './ProcurementStageBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';
import { ReferredToMinisterBanner } from '@/components/minister/ReferredToMinisterBanner';
import { NptabSourceBanner } from '@/components/nptab/NptabSourceBanner';
import {
  TENDER_STAGES,
  STAGE_CONFIG,
  METHOD_CONFIG,
  type Tender,
  type TenderStage,
  type TenderDocument,
  type TenderFieldChange,
  type TenderNote,
} from '@/lib/tender/types';

type TenderDetail = Tender & {
  field_changes: TenderFieldChange[];
  documents: TenderDocument[];
  notes: TenderNote[];
};

interface ProcurementDetailPanelProps {
  tenderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

function getAvailableStages(current: TenderStage): TenderStage[] {
  return TENDER_STAGES.filter((s) => s !== current);
}

function DateCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-navy-600">{label}</div>
      <div className="text-sm text-white">
        {value ? format(parseISO(value), 'd MMM yyyy') : <span className="text-navy-600">—</span>}
      </div>
    </div>
  );
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ProcurementDetailPanel({ tenderId, isOpen, onClose, onDeleted }: ProcurementDetailPanelProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'overview' | 'changelog'>('overview');

  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [selectedStage, setSelectedStage] = useState<TenderStage | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTender = useCallback(async () => {
    if (!tenderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/${tenderId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load tender');
        setTender(null);
        return;
      }
      const data = await res.json();
      setTender(data.tender);
    } catch {
      setError('Network error');
      setTender(null);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    if (isOpen && tenderId) {
      fetchTender();
      setNoteText('');
      setShowAdvanceForm(false);
      setSelectedStage(null);
      setConfirmingDelete(false);
      setTab('overview');
    }
  }, [isOpen, tenderId, fetchTender]);

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isDG = userRole === 'superadmin';
  const isAgencyAdmin = userRole === 'agency_manager';
  const isOwnAgency = tender && userAgency?.toLowerCase() === tender.agency.toLowerCase();
  const canModify = isDG || (isAgencyAdmin && isOwnAgency);

  const handleAdvanceStage = async () => {
    if (!tender || !selectedStage) return;
    setAdvancing(true);
    try {
      const res = await fetch('/api/procurement/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId: tender.id, newStage: selectedStage }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to change stage');
        return;
      }
      toast.success(`Moved to ${STAGE_CONFIG[selectedStage].label}`);
      setShowAdvanceForm(false);
      setSelectedStage(null);
      fetchTender();
    } catch {
      toast.error('Network error');
    } finally {
      setAdvancing(false);
    }
  };

  const handleSubmitNote = async () => {
    if (!noteText.trim() || !tenderId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/procurement/${tenderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to add note');
        return;
      }
      toast.success('Note added');
      setNoteText('');
      fetchTender();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenderId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/procurement/${tenderId}/documents`, { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to upload document');
        return;
      }
      toast.success('Document uploaded');
      fetchTender();
    } catch {
      toast.error('Network error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRevokeTracking = async () => {
    if (!tenderId) return;
    try {
      const res = await fetch(`/api/procurement/${tenderId}/revoke-tracking`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to revoke tracking');
        return;
      }
      toast.success('Sticky tracking revoked');
      fetchTender();
    } catch {
      toast.error('Network error');
    }
  };

  const handleDelete = async () => {
    if (!tenderId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/procurement/${tenderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to delete tender');
        return;
      }
      toast.success('Tender deleted');
      onClose();
      onDeleted?.();
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={tender?.description || 'Tender Details'}
      subtitle={tender?.agency_name}
      icon={Package}
      accentColor="from-gold-600 to-gold-500"
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12"><Spinner /></div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-12"><p className="text-red-400 text-sm">{error}</p></div>
      ) : !tender ? (
        <div className="flex-1 flex items-center justify-center py-12"><p className="text-navy-600 text-sm">Tender not found</p></div>
      ) : (
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-navy-800">
            <button onClick={() => setTab('overview')} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === 'overview' ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'}`}>Overview</button>
            <button onClick={() => setTab('changelog')} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'changelog' ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'}`}>
              <History className="h-3 w-3" />
              Change Log ({tender.field_changes.length})
            </button>
          </div>

          {tab === 'overview' ? (
            <>
              <ReferredToMinisterBanner referral={tender.activeMinisterReferral} />
              <NptabSourceBanner queued={tender.activeNptabQueue} reported={tender.latestNptabReport} />
              <div className="space-y-3">
                <div className="flex items-center flex-wrap gap-2">
                  <AgencyBadge agency={tender.agency} />
                  {tender.method && <span className="text-xs text-navy-600">{METHOD_CONFIG[tender.method].label}</span>}
                  {tender.is_rollover && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Repeat className="h-3 w-3" /> Rollover
                    </span>
                  )}
                  {tender.has_exception && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                      <AlertTriangle className="h-3 w-3" /> See Remarks
                    </span>
                  )}
                  {tender.stage_source === 'inferred_from_dates' && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30" title="Stage inferred from dates (status col was blank or a flag)">
                      <HelpCircle className="h-3 w-3" /> Inferred
                    </span>
                  )}
                  {tender.first_appearance_already_awarded && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" title="Tender first appeared already at Award — true transition date unknown">
                      <Award className="h-3 w-3" /> Inherited Award
                    </span>
                  )}
                  {tender.keep_tracking_despite_missing && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30" title="Resurrected. Subsequent uploads that omit this tender will not flag it as missing again.">
                      <Eye className="h-3 w-3" /> Tracked despite missing
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <ProcurementStageIndicator currentStage={tender.stage} />
                  <ProcurementStageBadge stage={tender.stage} />
                </div>

                <div className="flex items-center gap-2">
                  <DaysAtStageIndicator days={tender.days_at_current_stage} />
                  <span className="text-xs text-navy-600">at current stage</span>
                  {tender.stage_source === 'inferred_from_dates' && (
                    <span className="text-[10px] text-slate-400 italic">(stage inferred from dates)</span>
                  )}
                </div>

                {tender.programme_activity && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-navy-600">Programme Activity</div>
                    <p className="text-sm text-slate-300">{tender.programme_activity}</p>
                  </div>
                )}

                {tender.programme_code && (
                  <div className="flex items-center gap-3 text-xs text-navy-600">
                    <span>Programme {tender.programme_code}</span>
                    {tender.sub_programme_code && <><span>·</span><span>Sub-programme {tender.sub_programme_code}</span></>}
                    {tender.line_item_code && <><span>·</span><span>Line {tender.line_item_code}</span></>}
                  </div>
                )}
              </div>

              {/* Procurement timeline */}
              <div className="border-t border-navy-800" />
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Procurement Timeline</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <DateCell label="Advertised"        value={tender.date_advertised} />
                  <DateCell label="Tender closed"     value={tender.date_closed} />
                  <DateCell label="Eval → MTB/RTB"    value={tender.date_eval_sent_mtb_rtb} />
                  <DateCell label="Eval → NPTAB"      value={tender.date_eval_sent_nptab} />
                  <DateCell label="Date of award (PSIP col I)" value={tender.date_of_award} />
                  {tender.awarded_at && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-navy-600">Awarded at (ingest)</div>
                      <div className="text-sm text-white">
                        {format(parseISO(tender.awarded_at), 'd MMM yyyy · HH:mm')}
                        {tender.first_appearance_already_awarded && (
                          <span className="text-[10px] text-emerald-300 ml-1">(first seen already awarded)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Implementation */}
              {(tender.contractor || tender.implementation_start_date || tender.implementation_end_date || tender.implementation_status_pct != null) && (
                <>
                  <div className="border-t border-navy-800" />
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Implementation</h3>
                    {tender.contractor && (
                      <div className="mb-3">
                        <div className="text-[11px] uppercase tracking-wider text-navy-600">Contractor</div>
                        <p className="text-sm text-white">{tender.contractor}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <DateCell label="Start"    value={tender.implementation_start_date} />
                      <DateCell label="End"      value={tender.implementation_end_date} />
                      {tender.implementation_status_pct != null && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-navy-600">Status %</div>
                          <div className="text-sm text-white">{tender.implementation_status_pct}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {tender.remarks && (
                <>
                  <div className="border-t border-navy-800" />
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Remarks</h3>
                    <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{tender.remarks}</p>
                  </div>
                </>
              )}

              {/* Advance stage */}
              {canModify && (
                <>
                  <div className="border-t border-navy-800" />
                  <div>
                    {!showAdvanceForm ? (
                      <button onClick={() => setShowAdvanceForm(true)} className="btn-gold px-4 py-2 text-sm">Change Stage</button>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border border-navy-800 bg-navy-900/50">
                        <label className="block text-xs text-slate-400 mb-1">Move to</label>
                        <select
                          value={selectedStage ?? ''}
                          onChange={(e) => setSelectedStage((e.target.value || null) as TenderStage | null)}
                          className="w-full px-3 py-2.5 bg-navy-900 border border-navy-800 rounded-lg text-white text-sm focus:outline-none focus:border-gold-500"
                        >
                          <option value="">Select stage</option>
                          {getAvailableStages(tender.stage).map((s) => (
                            <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setShowAdvanceForm(false); setSelectedStage(null); }} className="px-4 py-2 text-sm text-slate-400 border border-navy-800 rounded-lg hover:border-navy-700 transition-colors">Cancel</button>
                          <button onClick={handleAdvanceStage} disabled={advancing || !selectedStage} className="btn-gold px-4 py-2 text-sm flex items-center gap-2">
                            {advancing ? <Spinner size="sm" className="border-navy-950 border-t-transparent" /> : <ArrowRight className="h-3.5 w-3.5" />}
                            {advancing ? 'Moving…' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Documents */}
              <div className="border-t border-navy-800" />
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gold-500" />
                  Documents
                  {tender.documents.length > 0 && <span className="text-xs text-navy-600 font-normal">({tender.documents.length})</span>}
                </h3>
                {tender.documents.length === 0 ? (
                  <p className="text-sm text-navy-600 py-2">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {tender.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-navy-800 bg-navy-900/30">
                        <FileText className="h-4 w-4 text-navy-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{doc.file_name}</p>
                          <p className="text-xs text-navy-600">
                            {doc.uploaded_by_name} · {formatDistanceToNow(parseISO(doc.uploaded_at), { addSuffix: true })}
                          </p>
                        </div>
                        <a href={`/api/procurement/${tender.id}/documents/${doc.id}`} className="text-gold-500 hover:text-gold-400 text-xs transition-colors shrink-0">
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                {canModify && (
                  <div>
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.jpeg,.jpg,.png" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-navy-700 text-sm text-navy-600 hover:border-gold-500/50 hover:text-gold-500 transition-colors">
                      {uploading ? <><Spinner size="sm" /><span>Uploading…</span></> : <><Upload className="h-4 w-4" /><span>Upload Document</span></>}
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="border-t border-navy-800" />
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <MessageSquare className="h-4 w-4 text-gold-500" />
                  Notes
                </h3>
                <div className="space-y-2 mb-5">
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note to track this tender…" rows={3} className="w-full px-3 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none" />
                  <div className="flex justify-end">
                    <button onClick={handleSubmitNote} disabled={submittingNote || !noteText.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-[#e5c348] disabled:opacity-50 transition-colors">
                      {submittingNote ? <Spinner size="sm" className="border-navy-950 border-t-transparent" /> : <Send className="h-3.5 w-3.5" />}
                      {submittingNote ? 'Saving…' : 'Add Note'}
                    </button>
                  </div>
                </div>
                {tender.notes.length === 0 ? (
                  <div className="text-center py-6">
                    <MessageSquare className="h-8 w-8 text-navy-700 mx-auto mb-2" />
                    <p className="text-sm text-navy-600">No notes yet.</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {tender.notes.map((note, i) => {
                      const initial = note.created_by_name?.[0]?.toUpperCase() || '?';
                      return (
                        <div key={note.id} className="relative pl-10 pb-5 last:pb-0">
                          {i < tender.notes.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-navy-800" />}
                          <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-gold-500/20 border border-gold-500/30 flex items-center justify-center text-xs font-bold text-gold-500">{initial}</div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-white">{note.created_by_name}</span>
                              <span className="text-[10px] text-navy-600">{formatDistanceToNow(parseISO(note.created_at), { addSuffix: true })}</span>
                            </div>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {canModify && (
                <>
                  <div className="border-t border-navy-800" />
                  <div>
                    {confirmingDelete ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-white">Delete this tender permanently?</p>
                        <p className="text-xs text-navy-600">All documents, notes, and change history will be removed. This cannot be undone.</p>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setConfirmingDelete(false)} className="flex-1 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-navy-800 transition-colors">Cancel</button>
                          <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setConfirmingDelete(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="h-4 w-4" /> Delete tender
                        </button>
                        {tender.keep_tracking_despite_missing && (
                          <button
                            onClick={handleRevokeTracking}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-violet-300 hover:bg-violet-500/10 transition-colors"
                            title="Stop tracking this tender once PSIP omits it again"
                          >
                            <EyeOff className="h-4 w-4" /> Revoke sticky tracking
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <ChangeLogTab changes={tender.field_changes} />
          )}
        </div>
      )}
    </SlidePanel>
  );
}

function ChangeLogTab({ changes }: { changes: TenderFieldChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="h-8 w-8 text-navy-700 mx-auto mb-2" />
        <p className="text-sm text-navy-600">No changes logged yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-0">
      {changes.map((c, i) => {
        const isStage = c.field_name === 'stage';
        const isPresence = c.field_name === '__presence';
        const isCreated = c.field_name === '__created';
        const color = isStage ? '#d4af37' : isPresence ? '#f472b6' : isCreated ? '#34d399' : '#64748b';
        return (
          <div key={c.id} className="relative pl-10 pb-5 last:pb-0">
            {i < changes.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-navy-800" />}
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}22`, border: `1px solid ${color}4D` }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-1.5 mb-1">
                <span className="text-xs font-semibold text-white">{c.field_name === '__created' ? 'Created' : c.field_name === '__presence' ? 'Presence' : c.field_name}</span>
                {c.upload_id && <span className="text-[10px] text-slate-400 italic">from upload</span>}
              </div>
              {!isCreated && (
                <div className="text-xs text-slate-300">
                  <span className="text-navy-600 line-through">{fmtValue(c.old_value)}</span>
                  <ArrowRight className="inline h-3 w-3 mx-1 text-navy-600" />
                  <span className="text-white">{fmtValue(c.new_value)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] text-navy-600 mt-0.5">
                {c.changed_by_name && <><span>{c.changed_by_name}</span><span>·</span></>}
                <span>{formatDistanceToNow(parseISO(c.changed_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
