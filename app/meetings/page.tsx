'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format, isPast, isToday } from 'date-fns';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  BookOpen,
  Plus,
  Search,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Download,
  FileText,
  MessageSquare,
  ListChecks,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  Mic,
  XCircle,
  Trash2,
  Pencil,
  Check,
  X,
  StickyNote,
  CalendarPlus,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { NewMeetingModal } from '@/components/meetings/NewMeetingModal';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeetingAction {
  id: string;
  meeting_id: string;
  task: string;
  owner: string | null;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  duration_secs: number | null;
  status: string;
  audio_path: string | null;
  attendees: string[];
  transcript_raw: { segments?: TranscriptSegment[] } | null;
  transcript_text: string | null;
  summary: string | null;
  decisions: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  meeting_actions: MeetingAction[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type MeetingStatus = 'UPLOADED' | 'TRANSCRIBING' | 'TRANSCRIBED' | 'ANALYZING' | 'ANALYZED' | 'ERROR';

const STATUS_CONFIG: Record<MeetingStatus, {
  variant: 'default' | 'success' | 'warning' | 'danger' | 'gold';
  label: string;
  pulse?: boolean;
}> = {
  UPLOADED:     { variant: 'default', label: 'Uploaded' },
  TRANSCRIBING: { variant: 'gold',    label: 'Transcribing', pulse: true },
  TRANSCRIBED:  { variant: 'warning', label: 'Transcribed' },
  ANALYZING:    { variant: 'gold',    label: 'Analyzing',    pulse: true },
  ANALYZED:     { variant: 'success', label: 'Analyzed' },
  ERROR:        { variant: 'danger',  label: 'Error' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as MeetingStatus] || STATUS_CONFIG.UPLOADED;
  return (
    <Badge variant={config.variant}>
      {config.pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-1.5 shrink-0" />
      )}
      {config.label}
    </Badge>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'analysis',   label: 'Analysis',   icon: FileText },
  { key: 'transcript', label: 'Transcript', icon: MessageSquare },
  { key: 'actions',    label: 'Actions',    icon: ListChecks },
  { key: 'notes',      label: 'Notes',      icon: StickyNote },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('analysis');

  // Processing state
  const [processing, setProcessing] = useState(false);

  // Modal
  const [showNewModal, setShowNewModal] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit header
  const [editingHeader, setEditingHeader] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAttendees, setEditAttendees] = useState('');
  const [savingHeader, setSavingHeader] = useState(false);

  // Edit transcript
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editTranscriptText, setEditTranscriptText] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);

  // Edit action items
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editActionTask, setEditActionTask] = useState('');
  const [editActionOwner, setEditActionOwner] = useState('');
  const [editActionDue, setEditActionDue] = useState('');
  const [savingAction, setSavingAction] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [newActionTask, setNewActionTask] = useState('');
  const [newActionOwner, setNewActionOwner] = useState('');
  const [newActionDue, setNewActionDue] = useState('');
  const [addingAction, setAddingAction] = useState(false);

  // Notes
  const [notesText, setNotesText] = useState('');
  const [notesSaved, setNotesSaved] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesPreview, setNotesPreview] = useState(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch list ────────────────────────────────────────────────────────────

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) throw new Error('Failed to fetch meetings');
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  // ── Fetch detail ──────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (!res.ok) throw new Error('Failed to fetch meeting');
      const data = await res.json();
      setSelectedMeeting(data.meeting);
      setNotesText(data.meeting.notes || '');
      setNotesSaved(true);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load meeting');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveTab('analysis');
    setEditingHeader(false);
    setEditingTranscript(false);
    setEditingActionId(null);
    setShowAddAction(false);
    setShowDeleteConfirm(false);
    setNotesPreview(false);
    fetchDetail(id);
  }, [fetchDetail]);

  const handleBack = useCallback(() => {
    setSelectedId(null);
    setSelectedMeeting(null);
    setEditingHeader(false);
    setEditingTranscript(false);
    setShowDeleteConfirm(false);
  }, []);

  // ── Polling for TRANSCRIBING / ANALYZING ──────────────────────────────────

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const status = selectedMeeting?.status;
    if (selectedId && (status === 'TRANSCRIBING' || status === 'ANALYZING')) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/meetings/${selectedId}`);
          if (!res.ok) return;
          const data = await res.json();
          setSelectedMeeting(data.meeting);
          if (data.meeting.status !== status) {
            fetchMeetings();
          }
        } catch { /* ignore poll errors */ }
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [selectedId, selectedMeeting?.status, fetchMeetings]);

  // ── Pipeline Handlers ─────────────────────────────────────────────────────

  async function handleTranscribe() {
    if (!selectedId || processing) return;
    setProcessing(true);
    try {
      setSelectedMeeting((prev) =>
        prev ? { ...prev, status: 'TRANSCRIBING' } : prev
      );
      const res = await fetch(`/api/meetings/${selectedId}/transcribe`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Transcription failed');
      }
      await fetchDetail(selectedId);
      fetchMeetings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      setSelectedMeeting((prev) =>
        prev ? { ...prev, status: 'ERROR' } : prev
      );
      setDetailError(msg);
    } finally {
      setProcessing(false);
    }
  }

  async function handleAnalyze() {
    if (!selectedId || processing) return;
    setProcessing(true);
    try {
      setSelectedMeeting((prev) =>
        prev ? { ...prev, status: 'ANALYZING' } : prev
      );
      const res = await fetch(`/api/meetings/${selectedId}/analyze`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Analysis failed');
      }
      await fetchDetail(selectedId);
      fetchMeetings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setSelectedMeeting((prev) =>
        prev ? { ...prev, status: 'ERROR' } : prev
      );
      setDetailError(msg);
    } finally {
      setProcessing(false);
    }
  }

  async function handleRetry() {
    if (!selectedMeeting || !selectedId) return;
    if (selectedMeeting.transcript_text) {
      await handleAnalyze();
    } else {
      await handleTranscribe();
    }
  }

  // ── Delete Meeting ──────────────────────────────────────────────────────────

  async function handleDeleteMeeting() {
    if (!selectedId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete meeting');
      setSelectedId(null);
      setSelectedMeeting(null);
      setShowDeleteConfirm(false);
      fetchMeetings();
    } catch (err) {
      console.error('Delete failed:', err);
      setDetailError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  // ── Edit Header (title + attendees) ──────────────────────────────────────

  function startEditHeader() {
    if (!selectedMeeting) return;
    setEditTitle(selectedMeeting.title);
    setEditAttendees(selectedMeeting.attendees.join(', '));
    setEditingHeader(true);
  }

  async function saveHeader() {
    if (!selectedId) return;
    setSavingHeader(true);
    try {
      const attendees = editAttendees
        .split(',')
        .map(a => a.trim())
        .filter(Boolean);
      const res = await fetch(`/api/meetings/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, attendees }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const { meeting } = await res.json();
      setSelectedMeeting(meeting);
      setEditingHeader(false);
      fetchMeetings();
    } catch (err) {
      console.error('Save header failed:', err);
    } finally {
      setSavingHeader(false);
    }
  }

  // ── Edit Transcript ──────────────────────────────────────────────────────

  function startEditTranscript() {
    if (!selectedMeeting) return;
    setEditTranscriptText(selectedMeeting.transcript_text || '');
    setEditingTranscript(true);
  }

  async function saveTranscript() {
    if (!selectedId) return;
    setSavingTranscript(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_text: editTranscriptText }),
      });
      if (!res.ok) throw new Error('Failed to save transcript');
      const { meeting } = await res.json();
      setSelectedMeeting(meeting);
      setEditingTranscript(false);
    } catch (err) {
      console.error('Save transcript failed:', err);
    } finally {
      setSavingTranscript(false);
    }
  }

  // ── Action Item Handlers ──────────────────────────────────────────────────

  async function handleToggleAction(actionId: string) {
    if (!selectedId || !selectedMeeting) return;

    // Optimistic update
    setSelectedMeeting((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        meeting_actions: prev.meeting_actions.map((a) =>
          a.id === actionId ? { ...a, done: !a.done } : a
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/meetings/${selectedId}/actions/${actionId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
      if (!res.ok) throw new Error('Failed to update action');
      const { action } = await res.json();
      setSelectedMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meeting_actions: prev.meeting_actions.map((a) =>
            a.id === action.id ? action : a
          ),
        };
      });
      fetchMeetings();
    } catch {
      // Revert on error
      setSelectedMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meeting_actions: prev.meeting_actions.map((a) =>
            a.id === actionId ? { ...a, done: !a.done } : a
          ),
        };
      });
    }
  }

  async function handlePushToTask(action: MeetingAction) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: action.task,
          description: `From meeting: ${selectedMeeting?.title}`,
          due_date: action.due_date || null,
          priority: 'medium',
          role: 'Meeting Action Item',
        }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      await handleToggleAction(action.id);
    } catch (err) {
      console.error('Push to task failed:', err);
    }
  }

  // ── Edit Action Item ───────────────────────────────────────────────────────

  function startEditAction(action: MeetingAction) {
    setEditingActionId(action.id);
    setEditActionTask(action.task);
    setEditActionOwner(action.owner || '');
    setEditActionDue(action.due_date || '');
  }

  async function saveEditAction() {
    if (!selectedId || !editingActionId) return;
    setSavingAction(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}/actions/${editingActionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: editActionTask,
          owner: editActionOwner || null,
          due_date: editActionDue || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update action');
      const { action } = await res.json();
      setSelectedMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meeting_actions: prev.meeting_actions.map((a) =>
            a.id === action.id ? action : a
          ),
        };
      });
      setEditingActionId(null);
      fetchMeetings();
    } catch (err) {
      console.error('Save action failed:', err);
    } finally {
      setSavingAction(false);
    }
  }

  async function handleDeleteAction(actionId: string) {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/meetings/${selectedId}/actions/${actionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete action');
      setSelectedMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meeting_actions: prev.meeting_actions.filter((a) => a.id !== actionId),
        };
      });
      fetchMeetings();
    } catch (err) {
      console.error('Delete action failed:', err);
    }
  }

  async function handleAddAction() {
    if (!selectedId || !newActionTask.trim()) return;
    setAddingAction(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: newActionTask.trim(),
          owner: newActionOwner.trim() || null,
          due_date: newActionDue || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add action');
      const { action } = await res.json();
      setSelectedMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meeting_actions: [...prev.meeting_actions, action],
        };
      });
      setNewActionTask('');
      setNewActionOwner('');
      setNewActionDue('');
      setShowAddAction(false);
      fetchMeetings();
    } catch (err) {
      console.error('Add action failed:', err);
    } finally {
      setAddingAction(false);
    }
  }

  // ── Notes Auto-Save ──────────────────────────────────────────────────────

  function handleNotesChange(value: string) {
    setNotesText(value);
    setNotesSaved(false);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      saveNotes(value);
    }, 1500);
  }

  async function saveNotes(text: string) {
    if (!selectedId) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/meetings/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: text }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      setNotesSaved(true);
    } catch (err) {
      console.error('Save notes failed:', err);
    } finally {
      setSavingNotes(false);
    }
  }

  // Cleanup notes timer
  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  // ── New Meeting Callback ──────────────────────────────────────────────────

  function handleNewMeetingComplete(meetingId: string) {
    setShowNewModal(false);
    fetchMeetings();
    handleSelect(meetingId);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return meetings;
    const q = searchQuery.toLowerCase();
    return meetings.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.attendees.some(a => a.toLowerCase().includes(q))
    );
  }, [meetings, searchQuery]);

  const totalMeetings = meetings.length;
  const analyzedCount = meetings.filter(m => m.status === 'ANALYZED').length;
  const openActions = meetings.reduce(
    (sum, m) => sum + (m.meeting_actions?.filter(a => !a.done).length || 0),
    0
  );

  // ── Render Helpers ────────────────────────────────────────────────────────

  function renderAnalysisTab() {
    if (!selectedMeeting) return null;
    const { status } = selectedMeeting;

    // ANALYZED — full analysis view
    if (status === 'ANALYZED' && selectedMeeting.summary) {
      return (
        <div className="space-y-4">
          {/* Summary */}
          <div className="glass-card p-4 rounded-xl">
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Summary
            </h3>
            <p className="text-[#c8d1df] text-sm leading-relaxed">
              {selectedMeeting.summary}
            </p>
          </div>

          {/* Decisions */}
          {selectedMeeting.decisions?.length > 0 && (
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
                Key Decisions
              </h3>
              <ul className="space-y-2">
                {selectedMeeting.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#c8d1df]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick Actions Summary */}
          {selectedMeeting.meeting_actions?.length > 0 && (
            <div className="glass-card p-4 rounded-xl">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
                Action Items
              </h3>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-emerald-400 font-medium">
                  {selectedMeeting.meeting_actions.filter(a => a.done).length}
                </span>
                <span className="text-[#64748b]">done</span>
                <span className="text-[#2d3a52]">·</span>
                <span className="text-amber-400 font-medium">
                  {selectedMeeting.meeting_actions.filter(a => !a.done).length}
                </span>
                <span className="text-[#64748b]">open</span>
              </div>
            </div>
          )}

          {/* Re-analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={processing}
            className="btn-navy flex items-center gap-2 text-xs px-3 py-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
            Re-analyze
          </button>
        </div>
      );
    }

    // TRANSCRIBED — ready to analyze
    if (status === 'TRANSCRIBED') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#d4af37]/20 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-[#d4af37]" />
          </div>
          <h3 className="text-white font-medium mb-1">Transcript Ready</h3>
          <p className="text-[#64748b] text-sm mb-6 max-w-xs">
            Audio has been transcribed. Run AI analysis to generate a summary, key decisions, and action items.
          </p>
          <button
            onClick={handleAnalyze}
            disabled={processing}
            className="btn-gold flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Analyze with GPT-4o
          </button>
        </div>
      );
    }

    // UPLOADED — ready to transcribe
    if (status === 'UPLOADED') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#2d3a52]/60 flex items-center justify-center mb-4">
            <Mic className="h-7 w-7 text-[#64748b]" />
          </div>
          <h3 className="text-white font-medium mb-1">Audio Uploaded</h3>
          <p className="text-[#64748b] text-sm mb-6 max-w-xs">
            Start transcription to convert audio to text using OpenAI Whisper.
          </p>
          <button
            onClick={handleTranscribe}
            disabled={processing}
            className="btn-gold flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            Transcribe with Whisper
          </button>
        </div>
      );
    }

    // TRANSCRIBING / ANALYZING — processing
    if (status === 'TRANSCRIBING' || status === 'ANALYZING') {
      const label = status === 'TRANSCRIBING' ? 'Transcribing audio...' : 'Analyzing transcript...';
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="h-10 w-10 text-[#d4af37] animate-spin mb-4" />
          <h3 className="text-white font-medium mb-1">{label}</h3>
          <p className="text-[#64748b] text-sm">This may take a minute. Auto-refreshing...</p>
        </div>
      );
    }

    // ERROR
    if (status === 'ERROR') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mb-4">
            <XCircle className="h-7 w-7 text-red-400" />
          </div>
          <h3 className="text-white font-medium mb-1">Processing Failed</h3>
          <p className="text-[#64748b] text-sm mb-6 max-w-xs">
            Something went wrong. You can retry the last step.
          </p>
          <button
            onClick={handleRetry}
            disabled={processing}
            className="btn-gold flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Retry
          </button>
        </div>
      );
    }

    // Fallback
    return (
      <p className="text-[#64748b] text-sm">
        Analysis will appear here once the meeting is processed.
      </p>
    );
  }

  function renderTranscriptTab() {
    if (!selectedMeeting) return null;

    if (!selectedMeeting.transcript_text) {
      return (
        <p className="text-[#64748b] text-sm">
          Transcript will appear here after transcription.
        </p>
      );
    }

    // Edit mode
    if (editingTranscript) {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#64748b]">Edit transcript text</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingTranscript(false)}
                className="btn-navy flex items-center gap-1 px-2 py-1 text-xs"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
              <button
                onClick={saveTranscript}
                disabled={savingTranscript}
                className="btn-gold flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50"
              >
                {savingTranscript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
            </div>
          </div>
          <textarea
            value={editTranscriptText}
            onChange={(e) => setEditTranscriptText(e.target.value)}
            className="input-premium w-full min-h-[300px] text-sm font-mono leading-relaxed resize-y"
          />
          {selectedMeeting.status === 'ANALYZED' && (
            <button
              onClick={handleAnalyze}
              disabled={processing}
              className="btn-navy flex items-center gap-2 text-xs px-3 py-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${processing ? 'animate-spin' : ''}`} />
              Re-analyze with updated transcript
            </button>
          )}
        </div>
      );
    }

    return (
      <div>
        <div className="flex justify-end mb-3">
          <button
            onClick={startEditTranscript}
            className="btn-navy flex items-center gap-1 px-2 py-1 text-xs"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>

        {/* If we have segments with timestamps, render them */}
        {(() => {
          const segments = selectedMeeting.transcript_raw?.segments;
          if (segments && segments.length > 0) {
            return (
              <div className="space-y-0.5">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 py-1.5 group hover:bg-[#1a2744]/30 rounded-lg px-2 -mx-2">
                    <span className="text-[10px] font-mono text-[#64748b] w-12 shrink-0 pt-0.5 text-right">
                      {formatTimestamp(seg.start)}
                    </span>
                    <p className="text-sm text-[#c8d1df] leading-relaxed">{seg.text.trim()}</p>
                  </div>
                ))}
              </div>
            );
          }

          // Plain text fallback
          return (
            <p className="text-[#c8d1df] text-sm leading-relaxed whitespace-pre-wrap">
              {selectedMeeting.transcript_text}
            </p>
          );
        })()}
      </div>
    );
  }

  function renderActionsTab() {
    if (!selectedMeeting) return null;
    const actions = selectedMeeting.meeting_actions || [];

    return (
      <div className="space-y-3">
        {/* Add action button */}
        <div className="flex justify-end">
          {!showAddAction && (
            <button
              onClick={() => setShowAddAction(true)}
              className="btn-navy flex items-center gap-1 px-2 py-1 text-xs"
            >
              <Plus className="h-3 w-3" /> Add action item
            </button>
          )}
        </div>

        {/* Add action form */}
        {showAddAction && (
          <div className="glass-card p-3 rounded-xl space-y-2">
            <input
              type="text"
              placeholder="Task description..."
              value={newActionTask}
              onChange={(e) => setNewActionTask(e.target.value)}
              className="input-premium w-full text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Owner"
                value={newActionOwner}
                onChange={(e) => setNewActionOwner(e.target.value)}
                className="input-premium flex-1 text-sm"
              />
              <input
                type="date"
                value={newActionDue}
                onChange={(e) => setNewActionDue(e.target.value)}
                className="input-premium flex-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setShowAddAction(false); setNewActionTask(''); setNewActionOwner(''); setNewActionDue(''); }}
                className="btn-navy px-2 py-1 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAction}
                disabled={addingAction || !newActionTask.trim()}
                className="btn-gold flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50"
              >
                {addingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add
              </button>
            </div>
          </div>
        )}

        {actions.length === 0 && !showAddAction && (
          <p className="text-[#64748b] text-sm">
            No action items yet. Click &quot;Add action item&quot; to create one.
          </p>
        )}

        {/* Open items */}
        {actions.filter(a => !a.done).map((a) => (
          <div
            key={a.id}
            className="flex items-start gap-3 p-3 rounded-xl border bg-[#1a2744]/50 border-[#2d3a52]/50"
          >
            {editingActionId === a.id ? (
              /* Edit mode */
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={editActionTask}
                  onChange={(e) => setEditActionTask(e.target.value)}
                  className="input-premium w-full text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Owner"
                    value={editActionOwner}
                    onChange={(e) => setEditActionOwner(e.target.value)}
                    className="input-premium flex-1 text-sm"
                  />
                  <input
                    type="date"
                    value={editActionDue}
                    onChange={(e) => setEditActionDue(e.target.value)}
                    className="input-premium flex-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => setEditingActionId(null)} className="btn-navy px-2 py-1 text-xs">
                    Cancel
                  </button>
                  <button
                    onClick={saveEditAction}
                    disabled={savingAction}
                    className="btn-gold flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {savingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <>
                <button
                  onClick={() => handleToggleAction(a.id)}
                  className="w-5 h-5 rounded-full border-2 border-[#64748b] hover:border-[#d4af37] mt-0.5 shrink-0 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{a.task}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {a.owner && (
                      <span className="px-2 py-0.5 rounded-full bg-[#2d3a52]/60 text-[#94a3b8] text-[10px]">
                        {a.owner}
                      </span>
                    )}
                    {a.due_date && (
                      <span
                        className={`flex items-center gap-1 text-[11px] ${
                          isPast(new Date(a.due_date)) && !isToday(new Date(a.due_date))
                            ? 'text-red-400'
                            : 'text-[#64748b]'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {format(new Date(a.due_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEditAction(a)}
                    className="p-1 rounded text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteAction(a.id)}
                    className="p-1 rounded text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handlePushToTask(a)}
                    className="btn-navy flex items-center gap-1 px-2 py-1 text-[10px] opacity-70 hover:opacity-100 transition-opacity ml-1"
                    title="Push to Task Board"
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    <span className="hidden sm:inline">Task</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Done items */}
        {(() => {
          const doneItems = actions.filter(a => a.done);
          const openItems = actions.filter(a => !a.done);
          if (doneItems.length === 0) return null;
          return (
            <>
              {openItems.length > 0 && (
                <div className="border-t border-[#2d3a52] pt-3 mt-3">
                  <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">
                    Completed
                  </p>
                </div>
              )}
              {doneItems.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20"
                >
                  <button
                    onClick={() => handleToggleAction(a.id)}
                    className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-400 flex items-center justify-center mt-0.5 shrink-0"
                  >
                    <CheckCircle2 className="h-3 w-3 text-[#0a1628]" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#64748b] line-through">{a.task}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {a.owner && (
                        <span className="px-2 py-0.5 rounded-full bg-[#2d3a52]/40 text-[#64748b] text-[10px]">
                          {a.owner}
                        </span>
                      )}
                      {a.due_date && (
                        <span className="flex items-center gap-1 text-[11px] text-[#64748b]">
                          <Clock className="h-3 w-3" />
                          {format(new Date(a.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDeleteAction(a.id)}
                      className="p-1 rounded text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          );
        })()}
      </div>
    );
  }

  function renderNotesTab() {
    if (!selectedMeeting) return null;

    return (
      <div className="space-y-3 h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotesPreview(false)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                !notesPreview ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setNotesPreview(true)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                notesPreview ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'
              }`}
            >
              Preview
            </button>
          </div>
          <span className={`text-[10px] transition-opacity ${notesSaved ? 'text-emerald-400' : savingNotes ? 'text-[#d4af37]' : 'text-[#64748b]'}`}>
            {savingNotes ? 'Saving...' : notesSaved ? 'Saved' : 'Unsaved changes'}
          </span>
        </div>

        {/* Editor / Preview */}
        {notesPreview ? (
          <div className="flex-1 glass-card p-4 rounded-xl overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:text-white prose-p:text-[#c8d1df] prose-strong:text-white prose-a:text-[#d4af37]">
            {notesText ? (
              <ReactMarkdown>{notesText}</ReactMarkdown>
            ) : (
              <p className="text-[#64748b] italic">No notes yet. Switch to Write to add notes.</p>
            )}
          </div>
        ) : (
          <textarea
            value={notesText}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Write meeting notes here... (Markdown supported)"
            className="input-premium w-full flex-1 min-h-[300px] text-sm leading-relaxed resize-y font-mono"
          />
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors touch-active"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
            <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Meetings</h1>
            <p className="text-xs md:text-sm text-[#64748b]">Record, transcribe &amp; analyze</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="btn-gold flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">New Meeting</span>
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="card-premium p-3 md:p-5">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-lg md:text-[2rem] font-semibold text-[#d4af37] leading-none">
            {totalMeetings}
          </p>
          <p className="text-[#64748b] text-[10px] md:text-xs mt-1">Total Meetings</p>
        </div>

        <div className="card-premium p-3 md:p-5">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-lg md:text-[2rem] font-semibold text-emerald-400 leading-none">
            {analyzedCount}
          </p>
          <p className="text-[#64748b] text-[10px] md:text-xs mt-1">Analyzed</p>
        </div>

        <div className="card-premium p-3 md:p-5">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <ListChecks className="h-4 w-4 md:h-5 md:w-5 text-amber-400" />
            </div>
          </div>
          <p className="text-lg md:text-[2rem] font-semibold text-amber-400 leading-none">
            {openActions}
          </p>
          <p className="text-[#64748b] text-[10px] md:text-xs mt-1">Open Actions</p>
        </div>
      </div>

      {/* Two-Panel Layout */}
      <div className="flex gap-4 md:gap-6 min-h-[calc(100vh-340px)]">
        {/* ── Left Panel ─────────────────────────────────────────────────── */}
        <div
          className={`${
            selectedId ? 'hidden md:flex' : 'flex'
          } w-full md:w-[320px] shrink-0 flex-col gap-3`}
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b] pointer-events-none" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium w-full py-2.5 text-sm"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>

          {/* Meeting List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[calc(100vh-440px)]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-premium p-3 animate-pulse">
                  <div className="h-4 bg-[#2d3a52] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-[#2d3a52] rounded w-1/2" />
                </div>
              ))
            ) : error ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-[#94a3b8] text-sm">{error}</p>
                <button onClick={fetchMeetings} className="btn-navy text-xs mt-3 px-3 py-1.5">
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="h-8 w-8 text-[#64748b] mx-auto mb-2" />
                <p className="text-[#94a3b8] text-sm">
                  {searchQuery ? 'No meetings match your search' : 'No meetings yet'}
                </p>
              </div>
            ) : (
              filtered.map((m) => {
                const isSelected = selectedId === m.id;
                const openCount = m.meeting_actions?.filter(a => !a.done).length || 0;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(m.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[#d4af37]/10 border-[#d4af37]/30'
                        : 'bg-[#1a2744]/50 border-transparent hover:bg-[#1a2744] hover:border-[#2d3a52]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-sm font-medium text-white truncate">{m.title}</h3>
                      <StatusBadge status={m.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#64748b]">
                      <span>{format(new Date(m.date), 'MMM d, yyyy')}</span>
                      {m.duration_secs != null && m.duration_secs > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(m.duration_secs)}
                        </span>
                      )}
                      {openCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <ListChecks className="h-3 w-3" />
                          {openCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right Panel ────────────────────────────────────────────────── */}
        <div
          className={`${
            selectedId ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col min-w-0`}
        >
          {!selectedId ? (
            <div className="card-premium flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="h-12 w-12 text-[#2d3a52] mx-auto mb-3" />
                <p className="text-[#64748b] text-sm">Select a meeting to view details</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="card-premium flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-[#d4af37] animate-spin" />
            </div>
          ) : detailError && !selectedMeeting ? (
            <div className="card-premium flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-[#94a3b8] text-sm">{detailError}</p>
                <button
                  onClick={() => fetchDetail(selectedId)}
                  className="btn-navy text-xs mt-3 px-3 py-1.5"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : selectedMeeting ? (
            <div className="card-premium flex-1 flex flex-col overflow-hidden">
              {/* Detail Header */}
              <div className="px-4 md:px-6 py-4 border-b border-[#2d3a52]">
                {/* Mobile back */}
                <button
                  onClick={handleBack}
                  className="md:hidden flex items-center gap-1 text-[#64748b] text-xs mb-2 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to list
                </button>

                {editingHeader ? (
                  /* Edit header mode */
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="input-premium w-full text-lg font-semibold"
                      placeholder="Meeting title"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editAttendees}
                      onChange={(e) => setEditAttendees(e.target.value)}
                      className="input-premium w-full text-sm"
                      placeholder="Attendees (comma-separated)"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingHeader(false)}
                        className="btn-navy flex items-center gap-1 px-2 py-1 text-xs"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        onClick={saveHeader}
                        disabled={savingHeader}
                        className="btn-gold flex items-center gap-1 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {savingHeader ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View header mode */
                  <>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h2 className="text-lg font-semibold text-white truncate min-w-0">
                        {selectedMeeting.title}
                      </h2>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={selectedMeeting.status} />
                        <button
                          onClick={startEditHeader}
                          className="p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
                          title="Edit title & attendees"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="p-1.5 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete meeting"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setShowCalendarModal(true)}
                          className="p-1.5 rounded-lg text-[#64748b] hover:text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
                          title="Add to Google Calendar"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-navy flex items-center gap-1.5 px-3 py-1.5 text-xs">
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Export</span>
                        </button>
                      </div>
                    </div>

                    {/* Delete Confirmation */}
                    {showDeleteConfirm && (
                      <div className="mb-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10">
                        <p className="text-sm text-red-300 mb-2">
                          Delete this meeting? This cannot be undone.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="btn-navy px-3 py-1 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleDeleteMeeting}
                            disabled={deleting}
                            className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748b]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {format(new Date(selectedMeeting.date), 'MMM d, yyyy · h:mm a')}
                      </span>
                      {selectedMeeting.duration_secs != null && selectedMeeting.duration_secs > 0 && (
                        <span>· {formatDuration(selectedMeeting.duration_secs)}</span>
                      )}
                      {selectedMeeting.attendees.length > 0 && (
                        <>
                          <span className="hidden sm:inline">·</span>
                          <Users className="h-3.5 w-3.5 hidden sm:block" />
                          <div className="flex flex-wrap gap-1 w-full sm:w-auto mt-1 sm:mt-0">
                            {selectedMeeting.attendees.map((a, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full bg-[#2d3a52]/60 text-[#94a3b8] text-[10px]"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Tabs */}
              <div className="px-4 md:px-6 pt-3 border-b border-[#2d3a52]">
                <div className="flex gap-1">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    const actionCount =
                      tab.key === 'actions'
                        ? selectedMeeting.meeting_actions?.filter(a => !a.done).length || 0
                        : 0;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${
                          isActive
                            ? 'text-[#d4af37] border-[#d4af37] bg-[#d4af37]/5'
                            : 'text-[#64748b] border-transparent hover:text-white'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.key === 'actions' && actionCount > 0 && (
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isActive
                                ? 'bg-[#d4af37]/20 text-[#d4af37]'
                                : 'bg-[#2d3a52] text-[#64748b]'
                            }`}
                          >
                            {actionCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
                {activeTab === 'analysis' && renderAnalysisTab()}
                {activeTab === 'transcript' && renderTranscriptTab()}
                {activeTab === 'actions' && renderActionsTab()}
                {activeTab === 'notes' && renderNotesTab()}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* New Meeting Modal */}
      <NewMeetingModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onComplete={handleNewMeetingComplete}
      />

      <CreateEventModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        defaultTitle={selectedMeeting?.title}
        defaultDate={selectedMeeting?.date?.split('T')[0]}
        defaultAttendees={selectedMeeting?.attendees?.filter(a => a.includes('@'))}
      />
    </div>
  );
}
