'use client';

import { useState, useRef, useEffect } from 'react';
import { ShieldAlert, Flag, Loader2 } from 'lucide-react';

interface EscalationControlsProps {
  projectId: string;
  projectName: string;
  escalated: boolean;
  escalationReason: string | null;
  userRole: string;
  /** Called after a successful escalate or de-escalate */
  onUpdate: () => void;
  /** Compact mode for slide panels */
  compact?: boolean;
}

export function EscalationControls({
  projectId,
  projectName,
  escalated,
  escalationReason,
  userRole,
  onUpdate,
  compact = false,
}: EscalationControlsProps) {
  const [showModal, setShowModal] = useState(false);
  const [deescalating, setDeescalating] = useState(false);
  const canDeescalate = ['dg', 'minister', 'ps'].includes(userRole);

  async function handleDeescalate() {
    setDeescalating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/escalate`, { method: 'DELETE' });
      if (res.ok) onUpdate();
    } catch {}
    setDeescalating(false);
  }

  return (
    <>
      {escalated && (
        <div className={`flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/30 ${compact ? 'p-3' : 'p-4'}`}>
          <ShieldAlert className={`text-red-400 shrink-0 mt-0.5 ${compact ? 'h-5 w-5' : 'h-5 w-5'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-semibold text-sm">Escalated</p>
            {escalationReason && <p className="text-red-400/80 text-xs mt-0.5">{escalationReason}</p>}
          </div>
          {canDeescalate && (
            <button
              onClick={handleDeescalate}
              disabled={deescalating}
              className="text-red-400/60 hover:text-red-400 text-xs shrink-0"
            >
              {deescalating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'De-escalate'}
            </button>
          )}
        </div>
      )}

      {!escalated && (
        <button
          onClick={() => setShowModal(true)}
          className={`flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors justify-center ${compact ? 'px-3 py-2 w-full' : 'px-4 py-2.5'}`}
        >
          <Flag className="h-4 w-4" /> Escalate Project
        </button>
      )}

      {showModal && (
        <EscalationModal
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); onUpdate(); }}
        />
      )}
    </>
  );
}

function EscalationModal({
  projectId,
  projectName,
  onClose,
  onDone,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const escalationModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (escalationModalRef.current) {
      const focusable = escalationModalRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      alert('Failed to escalate project');
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true">
      <div ref={escalationModalRef} role="dialog" aria-modal="true" aria-labelledby="escalation-controls-modal-title" className="card-premium p-6 w-full max-w-md mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 id="escalation-controls-modal-title" className="text-lg font-semibold text-white">Escalate Project</h2>
            <p className="text-[#64748b] text-xs line-clamp-1">{projectName}</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why does this project need escalation?"
          aria-label="Escalation reason"
          aria-required="true"
          className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-3 text-sm text-white placeholder-[#64748b] focus:border-red-400 focus:outline-none resize-none h-28"
        />
        <div className="flex items-center justify-end gap-3 mt-4">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
            className="bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Escalate'}
          </button>
        </div>
      </div>
    </div>
  );
}
