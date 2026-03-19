'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  Package, MessageSquare, Send, FileText, Upload, Download,
  ArrowRight, CheckCircle2,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { AgencyBadge } from './AgencyBadge';
import { ProcurementValueDisplay } from './ProcurementValueDisplay';
import { ProcurementStageIndicator } from './ProcurementStageIndicator';
import { ProcurementStageBadge } from './ProcurementStageBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';
import type {
  ProcurementPackage,
  ProcurementStageHistory,
  ProcurementDocument,
  ProcurementNote,
  ProcurementStage,
} from '@/lib/procurement-types';
import {
  PROCUREMENT_STAGES,
  STAGE_CONFIG,
  METHOD_CONFIG,
} from '@/lib/procurement-types';

// ── Types ────────────────────────────────────────────────────────────────

type PackageDetail = ProcurementPackage & {
  stage_history: ProcurementStageHistory[];
  documents: ProcurementDocument[];
  notes: ProcurementNote[];
};

interface ProcurementDetailPanelProps {
  packageId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getNextStage(current: ProcurementStage): ProcurementStage | null {
  const idx = PROCUREMENT_STAGES.indexOf(current);
  if (idx < 0 || idx >= PROCUREMENT_STAGES.length - 1) return null;
  return PROCUREMENT_STAGES[idx + 1];
}

// ── Component ────────────────────────────────────────────────────────────

export function ProcurementDetailPanel({ packageId, isOpen, onClose }: ProcurementDetailPanelProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data state
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advance stage state
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [advancing, setAdvancing] = useState(false);

  // Notes state
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Document upload state
  const [uploading, setUploading] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchPackage = useCallback(async () => {
    if (!packageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/${packageId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load package');
        setPkg(null);
        return;
      }
      const data = await res.json();
      setPkg(data.package);
    } catch {
      setError('Network error');
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    if (isOpen && packageId) {
      fetchPackage();
      setNoteText('');
      setShowAdvanceForm(false);
      setAdvanceNotes('');
    }
  }, [isOpen, packageId, fetchPackage]);

  // ── Derived state ──────────────────────────────────────────────────────

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isAgencyAdmin = userRole === 'agency_admin';
  const isOwnAgency = pkg && userAgency?.toLowerCase() === pkg.agency.toLowerCase();
  const canAdvance = isAgencyAdmin && isOwnAgency;
  const canUploadDocs = isAgencyAdmin && isOwnAgency;
  const nextStage = pkg ? getNextStage(pkg.current_stage) : null;
  const isComplete = pkg?.current_stage === 'awarded';

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAdvanceStage = async () => {
    if (!pkg || !nextStage) return;
    setAdvancing(true);
    try {
      const res = await fetch('/api/procurement/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          newStage: nextStage,
          notes: advanceNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to advance stage');
        return;
      }
      toast.success(`Moved to ${STAGE_CONFIG[nextStage].label}`);
      setShowAdvanceForm(false);
      setAdvanceNotes('');
      fetchPackage();
    } catch {
      toast.error('Network error');
    } finally {
      setAdvancing(false);
    }
  };

  const handleSubmitNote = async () => {
    if (!noteText.trim() || !packageId) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/procurement/${packageId}/notes`, {
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
      fetchPackage();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !packageId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/procurement/${packageId}/documents`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to upload document');
        return;
      }
      toast.success('Document uploaded');
      fetchPackage();
    } catch {
      toast.error('Network error');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={pkg?.title || 'Package Details'}
      subtitle={pkg?.agency_name}
      icon={Package}
      accentColor="from-gold-600 to-gold-500"
    >
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : !pkg ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <p className="text-navy-600 text-sm">Package not found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── 1. Header info ──────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Agency + Method + Value */}
            <div className="flex items-center flex-wrap gap-2">
              <AgencyBadge agency={pkg.agency} />
              <span className="text-xs text-navy-600">
                {METHOD_CONFIG[pkg.procurement_method]?.label ?? pkg.procurement_method}
              </span>
              <div className="ml-auto">
                <ProcurementValueDisplay value={pkg.estimated_value} size="lg" />
              </div>
            </div>

            {/* Stage indicator */}
            <div className="flex items-center gap-3">
              <ProcurementStageIndicator currentStage={pkg.current_stage} />
              <ProcurementStageBadge stage={pkg.current_stage} />
            </div>

            {/* Days at stage */}
            <div className="flex items-center gap-2">
              <DaysAtStageIndicator days={pkg.days_at_current_stage} />
              <span className="text-xs text-navy-600">at current stage</span>
            </div>

            {/* Description */}
            {pkg.description && (
              <p className="text-sm text-slate-300 leading-relaxed">{pkg.description}</p>
            )}

            {/* Metadata */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-navy-600">
              <span>Submitted by {pkg.submitted_by_name}</span>
              <span>&middot;</span>
              <span>{format(parseISO(pkg.created_at), 'MMM d, yyyy')}</span>
            </div>
          </div>

          {/* ── 2. Advance stage action ─────────────────────────────────── */}
          {canAdvance && (
            <>
              <div className="border-t border-navy-800" />
              <div>
                {isComplete ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-400">Procurement Complete</span>
                  </div>
                ) : nextStage ? (
                  <div className="space-y-3">
                    {!showAdvanceForm ? (
                      <button
                        onClick={() => setShowAdvanceForm(true)}
                        className="btn-gold px-4 py-2 text-sm"
                      >
                        Move to {STAGE_CONFIG[nextStage].label}
                      </button>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border border-navy-800 bg-navy-900/50">
                        <p className="text-xs text-slate-400">
                          Advancing from <ProcurementStageBadge stage={pkg.current_stage} size="sm" /> to <ProcurementStageBadge stage={nextStage} size="sm" />
                        </p>
                        <textarea
                          value={advanceNotes}
                          onChange={(e) => setAdvanceNotes(e.target.value)}
                          placeholder="Optional notes about this stage change..."
                          rows={2}
                          className="w-full px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-white placeholder-navy-600 focus:outline-none focus:border-gold-500 text-sm resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setShowAdvanceForm(false);
                              setAdvanceNotes('');
                            }}
                            className="px-4 py-2 text-sm text-slate-400 border border-navy-800 rounded-lg hover:border-navy-700 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAdvanceStage}
                            disabled={advancing}
                            className="btn-gold px-4 py-2 text-sm flex items-center gap-2"
                          >
                            {advancing ? (
                              <Spinner size="sm" className="border-navy-950 border-t-transparent" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                            {advancing ? 'Moving...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}

          {/* ── 3. Stage history timeline ───────────────────────────────── */}
          <div className="border-t border-navy-800" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Stage History</h3>
            {pkg.stage_history.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-navy-600">No stage transitions recorded.</p>
              </div>
            ) : (
              <div className="space-y-0">
                {pkg.stage_history.map((entry, i) => {
                  const stageColor = STAGE_CONFIG[entry.to_stage]?.color || '#94a3b8';
                  return (
                    <div key={entry.id} className="relative pl-10 pb-5 last:pb-0">
                      {/* Connecting line */}
                      {i < pkg.stage_history.length - 1 && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-navy-800" />
                      )}
                      {/* Circle indicator */}
                      <div
                        className="absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: `${stageColor}33`,
                          border: `1px solid ${stageColor}4D`,
                        }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: stageColor }}
                        />
                      </div>
                      {/* Content */}
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5 mb-1">
                          {entry.from_stage ? (
                            <>
                              <ProcurementStageBadge stage={entry.from_stage} size="sm" />
                              <ArrowRight className="h-3 w-3 text-navy-600" />
                            </>
                          ) : null}
                          <ProcurementStageBadge stage={entry.to_stage} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-navy-600">
                          <span>{entry.changed_by_name}</span>
                          <span>&middot;</span>
                          <span title={format(parseISO(entry.changed_at), 'PPpp')}>
                            {formatDistanceToNow(parseISO(entry.changed_at), { addSuffix: true })}
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-slate-400 italic mt-1">&ldquo;{entry.notes}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 4. Documents section ────────────────────────────────────── */}
          <div className="border-t border-navy-800" />
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-gold-500" />
              Documents
              {pkg.documents.length > 0 && (
                <span className="text-xs text-navy-600 font-normal">({pkg.documents.length})</span>
              )}
            </h3>

            {pkg.documents.length === 0 ? (
              <p className="text-sm text-navy-600 py-2">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {pkg.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-navy-800 bg-navy-900/30"
                  >
                    <FileText className="h-4 w-4 text-navy-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.file_name}</p>
                      <p className="text-xs text-navy-600">
                        {doc.uploaded_by_name} &middot;{' '}
                        <span title={format(parseISO(doc.uploaded_at), 'PPpp')}>
                          {formatDistanceToNow(parseISO(doc.uploaded_at), { addSuffix: true })}
                        </span>
                      </p>
                    </div>
                    <a
                      href={`/api/procurement/${pkg.id}/documents/${doc.id}/download`}
                      className="text-gold-500 hover:text-gold-400 text-xs transition-colors shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button — agency_admin only */}
            {canUploadDocs && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.jpeg,.jpg,.png"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-navy-700 text-sm text-navy-600 hover:border-gold-500/50 hover:text-gold-500 transition-colors"
                >
                  {uploading ? (
                    <>
                      <Spinner size="sm" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ── 5. Notes section ────────────────────────────────────────── */}
          <div className="border-t border-navy-800" />
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-gold-500" />
              Notes
            </h3>

            {/* Add note form */}
            <div className="space-y-2 mb-5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note to track this package..."
                rows={3}
                className="w-full px-3 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSubmitNote}
                  disabled={submittingNote || !noteText.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-[#e5c348] disabled:opacity-50 transition-colors"
                >
                  {submittingNote ? (
                    <Spinner size="sm" className="border-navy-950 border-t-transparent" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {submittingNote ? 'Saving...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {pkg.notes.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="h-8 w-8 text-navy-700 mx-auto mb-2" />
                <p className="text-sm text-navy-600">No notes yet.</p>
                <p className="text-xs text-navy-700 mt-1">Add the first note to track this package.</p>
              </div>
            ) : (
              <div className="space-y-0">
                {pkg.notes.map((note, i) => {
                  const initial = note.created_by_name?.[0]?.toUpperCase() || '?';
                  return (
                    <div key={note.id} className="relative pl-10 pb-5 last:pb-0">
                      {/* Connecting line */}
                      {i < pkg.notes.length - 1 && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-navy-800" />
                      )}
                      {/* Author initial circle */}
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-gold-500/20 border border-gold-500/30 flex items-center justify-center text-xs font-bold text-gold-500">
                        {initial}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-white">{note.created_by_name}</span>
                          <span
                            className="text-[10px] text-navy-600"
                            title={format(parseISO(note.created_at), 'PPpp')}
                          >
                            {formatDistanceToNow(parseISO(note.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-6 bg-navy-800 rounded w-14" />
          <div className="h-4 bg-navy-800 rounded w-24" />
          <div className="ml-auto h-6 bg-navy-800 rounded w-20" />
        </div>
        <div className="h-3 bg-navy-800 rounded w-48" />
        <div className="h-3 bg-navy-800 rounded w-32" />
      </div>
      {/* Divider */}
      <div className="h-px bg-navy-800" />
      {/* Stage history */}
      <div className="space-y-3">
        <div className="h-4 bg-navy-800 rounded w-28" />
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-navy-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-navy-800 rounded w-40" />
            <div className="h-3 bg-navy-800 rounded w-24" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-navy-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-navy-800 rounded w-36" />
            <div className="h-3 bg-navy-800 rounded w-20" />
          </div>
        </div>
      </div>
      {/* Divider */}
      <div className="h-px bg-navy-800" />
      {/* Documents */}
      <div className="space-y-3">
        <div className="h-4 bg-navy-800 rounded w-24" />
        <div className="h-12 bg-navy-800 rounded" />
      </div>
      {/* Divider */}
      <div className="h-px bg-navy-800" />
      {/* Notes */}
      <div className="space-y-3">
        <div className="h-4 bg-navy-800 rounded w-16" />
        <div className="h-20 bg-navy-800 rounded" />
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-navy-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-navy-800 rounded w-32" />
            <div className="h-10 bg-navy-800 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
