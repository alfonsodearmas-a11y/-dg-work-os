'use client';

import { useState, useCallback } from 'react';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileAudio,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Lightbulb,
  ArrowRight,
  ClipboardPaste,
  Send,
  RefreshCw,
  Mic,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { DraftActionItemCard, type DraftActionItemData } from './DraftActionItemCard';

// ── Types ──────────────────────────────────────────────────────────────────

interface RecordingData {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  notes: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  agency: string | null;
  status: string;
  error_message: string | null;
  raw_transcript: string | null;
  analysis: {
    summary: string;
    action_items: any[];
    decisions: string[];
    follow_ups: string[];
  } | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  created_at: string;
}

interface Props {
  recording: RecordingData;
  actionItems: DraftActionItemData[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning' | 'gold'; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { variant: 'success', label: 'Analysis Complete', icon: CheckCircle },
  processing: { variant: 'warning', label: 'Processing...', icon: Loader2 },
  transcribing: { variant: 'info', label: 'Transcribing...', icon: Loader2 },
  transcribed: { variant: 'info', label: 'Transcribed', icon: FileAudio },
  uploading: { variant: 'default', label: 'Uploading', icon: Clock },
  recording: { variant: 'gold', label: 'Recording...', icon: Mic },
  failed: { variant: 'danger', label: 'Failed', icon: AlertTriangle },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RecordingDetailView({ recording: initialRecording, actionItems: initialActionItems }: Props) {
  const [recording, setRecording] = useState(initialRecording);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDecisions, setShowDecisions] = useState(true);
  const [showFollowUps, setShowFollowUps] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // Manual transcript for uploading/failed states
  const [showPasteForm, setShowPasteForm] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const config = STATUS_CONFIG[recording.status] || STATUS_CONFIG.uploading;
  const StatusIcon = config.icon;
  const isAnimating = recording.status === 'processing' || recording.status === 'transcribing' || recording.status === 'recording';

  const pendingItems = actionItems.filter(i => i.review_status === 'pending');
  const approvedItems = actionItems.filter(i => i.review_status === 'pushed_to_notion' || i.review_status === 'approved');
  const rejectedItems = actionItems.filter(i => i.review_status === 'rejected');

  const handleItemUpdate = useCallback((updated: DraftActionItemData) => {
    setActionItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllPending = () => {
    setSelectedItems(new Set(pendingItems.map(i => i.id)));
  };

  async function handleBulkApprove() {
    if (selectedItems.size === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch('/api/meetings/action-items/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) }),
      });
      if (!res.ok) throw new Error('Bulk approve failed');

      // Refresh action items
      const itemsRes = await fetch(`/api/meetings/recordings/${recording.id}/action-items`);
      if (itemsRes.ok) {
        const { action_items } = await itemsRes.json();
        setActionItems(action_items);
      }
      setSelectedItems(new Set());
    } catch { /* silent */ }
    setBulkApproving(false);
  }

  async function handleSubmitTranscript() {
    if (!manualTranscript.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meetings/recordings/${recording.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_transcript', transcript: manualTranscript }),
      });
      if (!res.ok) throw new Error('Submit failed');
      setRecording(prev => ({ ...prev, status: 'processing', error_message: null }));
      setShowPasteForm(false);
      setManualTranscript('');
    } catch { /* stay in form */ }
    setSubmitting(false);
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/meetings/recordings/${recording.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (!res.ok) throw new Error('Retry failed');
      setRecording(prev => ({ ...prev, status: 'processing', error_message: null }));
    } catch { /* silent */ }
    setRetrying(false);
  }

  return (
    <div className="space-y-6">
      {/* ── Header Card ── */}
      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">{recording.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[#64748b]">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(recording.meeting_date || recording.created_at)}
              </span>
              {recording.duration_seconds && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {formatDuration(recording.duration_seconds)}
                </span>
              )}
              {recording.agency && (
                <span className="text-[#d4af37] bg-[#d4af37]/10 px-2 py-0.5 rounded text-xs font-medium">
                  {recording.agency}
                </span>
              )}
              {!recording.raw_transcript && !recording.duration_seconds && (
                <span className="text-[#d4af37] bg-[#d4af37]/10 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                  <ClipboardPaste className="h-3 w-3" /> Manual Transcript
                </span>
              )}
            </div>
          </div>
          <Badge variant={config.variant}>
            <StatusIcon className={`h-3 w-3 mr-1 ${isAnimating ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
        </div>

        {recording.attendees && recording.attendees.length > 0 && (
          <div className="flex items-center gap-2 pt-3 border-t border-[#2d3a52]/50">
            <Users className="h-4 w-4 text-[#64748b] shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {recording.attendees.map((name, i) => (
                <span key={i} className="text-xs bg-[#2d3a52] text-[#94a3b8] px-2 py-1 rounded">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {recording.ai_model && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[#2d3a52]/50 text-xs text-[#64748b]">
            <span>Model: {recording.ai_model}</span>
            {recording.ai_tokens_used && <span>{recording.ai_tokens_used.toLocaleString()} tokens</span>}
          </div>
        )}
      </div>

      {/* ── Waiting / Failed state ── */}
      {(recording.status === 'uploading' || recording.status === 'transcribed' || recording.status === 'failed') && (
        <div className="card-premium p-5 text-center">
          {recording.status === 'failed' && recording.error_message && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-4">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-red-400 text-sm text-left">{recording.error_message}</p>
            </div>
          )}

          {recording.status === 'uploading' && (
            <p className="text-[#64748b] mb-3">
              Audio uploaded. Scriberr is not available — paste the transcript manually or wait for Scriberr.
            </p>
          )}
          {recording.status === 'transcribed' && (
            <p className="text-[#64748b] mb-3">
              Transcript is ready. Click below to process it with AI.
            </p>
          )}
          {recording.status === 'failed' && (
            <p className="text-[#64748b] mb-3">
              Processing failed. You can retry or paste a new transcript.
            </p>
          )}

          <div className="flex items-center justify-center gap-2 flex-wrap">
            {recording.status === 'failed' && recording.raw_transcript && (
              <button onClick={handleRetry} disabled={retrying} className="btn-gold inline-flex items-center gap-2 px-5 py-2.5">
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry Processing
              </button>
            )}
            <button onClick={() => setShowPasteForm(!showPasteForm)} className="btn-gold inline-flex items-center gap-2 px-5 py-2.5">
              <ClipboardPaste className="h-4 w-4" /> Paste Transcript
            </button>
          </div>

          {showPasteForm && (
            <div className="mt-4 pt-4 border-t border-[#2d3a52] text-left">
              <textarea
                value={manualTranscript}
                onChange={e => setManualTranscript(e.target.value)}
                placeholder="Paste meeting transcript here..."
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-sm text-[#c8d1df] font-mono leading-relaxed focus:border-[#d4af37] focus:outline-none min-h-[200px] resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-[#64748b]">
                  {manualTranscript.trim() ? `${manualTranscript.trim().split(/\s+/).length} words` : 'No text yet'}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowPasteForm(false); setManualTranscript(''); }} className="btn-navy text-sm px-3 py-1.5">
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTranscript}
                    disabled={submitting || !manualTranscript.trim()}
                    className="btn-gold text-sm px-4 py-1.5 inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><Send className="h-4 w-4" /> Process</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Processing spinner ── */}
      {(recording.status === 'processing' || recording.status === 'transcribing') && (
        <div className="card-premium p-8 text-center">
          <Loader2 className="h-10 w-10 text-[#d4af37] animate-spin mx-auto mb-3" />
          <p className="text-white font-medium">
            {recording.status === 'transcribing' ? 'Transcribing audio...' : 'Analyzing transcript with AI...'}
          </p>
          <p className="text-[#64748b] text-sm mt-1">This may take a minute. The page will update automatically.</p>
        </div>
      )}

      {/* ── Summary ── */}
      {recording.analysis?.summary && (
        <div className="card-premium p-5">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Mic className="h-4 w-4 text-[#d4af37]" />
            Meeting Summary
          </h2>
          <div className="text-[#c8d1df] text-sm leading-relaxed whitespace-pre-wrap">
            {recording.analysis.summary}
          </div>
        </div>
      )}

      {/* ── Decisions ── */}
      {recording.analysis?.decisions && recording.analysis.decisions.length > 0 && (
        <div className="card-premium overflow-hidden">
          <button
            onClick={() => setShowDecisions(!showDecisions)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#1a2744]/30 transition-colors"
          >
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#d4af37]" />
              Decisions <span className="text-[#d4af37] text-sm font-normal ml-1">({recording.analysis.decisions.length})</span>
            </h2>
            {showDecisions ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
          </button>
          {showDecisions && (
            <div className="px-5 pb-5 space-y-2">
              {recording.analysis.decisions.map((decision, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-[#c8d1df] text-sm">{decision}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Action Items ── */}
      {actionItems.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2d3a52] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-[#d4af37]" />
                Action Items <span className="text-[#d4af37] text-sm font-normal ml-1">({actionItems.length})</span>
              </h2>
              {approvedItems.length > 0 && (
                <span className="text-xs text-emerald-400">{approvedItems.length} pushed</span>
              )}
              {rejectedItems.length > 0 && (
                <span className="text-xs text-red-400">{rejectedItems.length} rejected</span>
              )}
            </div>

            {pendingItems.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllPending}
                  className="text-xs text-[#64748b] hover:text-white transition-colors"
                >
                  Select All ({pendingItems.length})
                </button>
                {selectedItems.size > 0 && (
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkApproving}
                    className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Approve Selected ({selectedItems.size})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-[#2d3a52]/50">
            {actionItems.map(item => (
              <DraftActionItemCard
                key={item.id}
                item={item}
                selected={selectedItems.has(item.id)}
                onToggleSelect={toggleSelect}
                onUpdate={handleItemUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Follow-ups ── */}
      {recording.analysis?.follow_ups && recording.analysis.follow_ups.length > 0 && (
        <div className="card-premium overflow-hidden">
          <button
            onClick={() => setShowFollowUps(!showFollowUps)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#1a2744]/30 transition-colors"
          >
            <h2 className="text-white font-semibold flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-[#d4af37]" />
              Follow-ups <span className="text-[#d4af37] text-sm font-normal ml-1">({recording.analysis.follow_ups.length})</span>
            </h2>
            {showFollowUps ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
          </button>
          {showFollowUps && (
            <div className="px-5 pb-5 space-y-2">
              {recording.analysis.follow_ups.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 text-[#64748b] shrink-0 mt-0.5" />
                  <p className="text-[#c8d1df] text-sm">{item}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Transcript Drawer ── */}
      {recording.raw_transcript && (
        <div className="card-premium overflow-hidden">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#1a2744]/30 transition-colors"
          >
            <h2 className="text-[#64748b] font-medium text-sm">Raw Transcript</h2>
            {showTranscript ? <ChevronUp className="h-4 w-4 text-[#64748b]" /> : <ChevronDown className="h-4 w-4 text-[#64748b]" />}
          </button>
          {showTranscript && (
            <div className="px-5 pb-5">
              <pre className="bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-xs text-[#64748b] font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                {recording.raw_transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
