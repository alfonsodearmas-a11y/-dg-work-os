'use client';

import { useState } from 'react';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  SkipForward,
  Pencil,
  Save,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Target,
  ListTodo,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

// ── Types ──────────────────────────────────────────────────────────────────

interface LinkedActionItem {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  source_meeting: string;
  agency: string | null;
  junction_id: string | null;
  task_id: string | null;
  task_status: string | null;
  link_status: 'created' | 'failed' | 'unlinked';
  error_message: string | null;
}

interface MeetingData {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  category: string | null;
  raw_transcript: string | null;
  minutes_markdown: string | null;
  action_items: any[];
  linked_action_items?: LinkedActionItem[];
  status: string;
  error_message: string | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  processed_at: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning' | 'gold'; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { variant: 'success', label: 'Minutes Ready', icon: CheckCircle },
  processing: { variant: 'warning', label: 'Processing...', icon: Loader2 },
  pending: { variant: 'default', label: 'Pending', icon: Clock },
  failed: { variant: 'danger', label: 'Failed', icon: AlertTriangle },
  skipped: { variant: 'default', label: 'Skipped', icon: SkipForward },
  edited: { variant: 'info', label: 'Edited', icon: Pencil },
};

const PRIORITY_STYLES: Record<string, { variant: 'danger' | 'warning' | 'default'; label: string }> = {
  high: { variant: 'danger', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'default', label: 'Low' },
};

const TASK_STATUS_STYLES: Record<string, { color: string; label: string }> = {
  'To Do': { color: 'text-[#94a3b8]', label: 'To Do' },
  'In Progress': { color: 'text-blue-400', label: 'In Progress' },
  'Waiting': { color: 'text-amber-400', label: 'Waiting' },
  'Done': { color: 'text-emerald-400', label: 'Done' },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-white font-semibold text-base mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-white font-semibold text-lg mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-white font-bold text-xl mt-6 mb-3">$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em class="text-white">$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-[#c8d1df] list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-[#c8d1df] list-decimal">$1</li>')
    .replace(/^---$/gm, '<hr class="border-[#2d3a52] my-4" />')
    .replace(/`([^`]+)`/g, '<code class="bg-[#2d3a52] text-[#d4af37] px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^(?!<[hlu]|<li|<hr)(.+)$/gm, '<p class="text-[#c8d1df] mb-2">$1</p>')
    .replace(/^\s*$/gm, '');
}

// ── Component ──────────────────────────────────────────────────────────────

export function MeetingMinutesView({ meeting }: { meeting: MeetingData }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(meeting.minutes_markdown || '');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [retryingTasks, setRetryingTasks] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentMeeting, setCurrentMeeting] = useState(meeting);

  const config = STATUS_CONFIG[currentMeeting.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  // Use linked_action_items if available, otherwise fall back to raw action_items
  const linkedItems: LinkedActionItem[] = Array.isArray(currentMeeting.linked_action_items)
    ? currentMeeting.linked_action_items
    : [];
  const hasLinkedItems = linkedItems.length > 0;
  const rawActionItems = Array.isArray(currentMeeting.action_items) ? currentMeeting.action_items : [];
  const actionItems = hasLinkedItems ? linkedItems : rawActionItems;

  // Task summary stats
  const tasksCreated = linkedItems.filter(i => i.link_status === 'created').length;
  const tasksCompleted = linkedItems.filter(i => i.task_status === 'Done').length;
  const tasksFailed = linkedItems.filter(i => i.link_status === 'failed').length;
  const tasksUnlinked = linkedItems.filter(i => i.link_status === 'unlinked').length;
  const allLinked = actionItems.length > 0 && tasksUnlinked === 0 && tasksFailed === 0 && tasksCreated === actionItems.length;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${currentMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes_markdown: editText }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setCurrentMeeting(updated);
      setEditing(false);
    } catch { /* stay in edit mode */ }
    setSaving(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/meetings/${currentMeeting.id}/regenerate`, { method: 'POST' });
      if (!res.ok) throw new Error('Regenerate failed');
      const updated = await res.json();
      setCurrentMeeting(updated);
      setEditText(updated.minutes_markdown || '');
    } catch { /* silent */ }
    setRegenerating(false);
  }

  async function handleProcess() {
    setProcessing(true);
    try {
      const res = await fetch(`/api/meetings/${currentMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process' }),
      });
      if (!res.ok) throw new Error('Processing failed');
      const updated = await res.json();
      setCurrentMeeting(updated);
      setEditText(updated.minutes_markdown || '');
    } catch { /* silent */ }
    setProcessing(false);
  }

  async function handleCreateTasks() {
    setCreatingTasks(true);
    try {
      const res = await fetch(`/api/meetings/${currentMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_tasks' }),
      });
      if (!res.ok) throw new Error('Task creation failed');
      const data = await res.json();
      setCurrentMeeting(prev => ({ ...prev, linked_action_items: data.linked_action_items }));
    } catch { /* silent */ }
    setCreatingTasks(false);
  }

  async function handleRetryTasks() {
    setRetryingTasks(true);
    try {
      const res = await fetch(`/api/meetings/${currentMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_tasks' }),
      });
      if (!res.ok) throw new Error('Retry failed');
      const data = await res.json();
      setCurrentMeeting(prev => ({ ...prev, linked_action_items: data.linked_action_items }));
    } catch { /* silent */ }
    setRetryingTasks(false);
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">{currentMeeting.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-[#64748b]">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(currentMeeting.meeting_date)}
              </span>
              {currentMeeting.category && (
                <span className="text-[#d4af37] bg-[#d4af37]/10 px-2 py-0.5 rounded text-xs font-medium">
                  {currentMeeting.category}
                </span>
              )}
            </div>
          </div>
          <Badge variant={config.variant}>
            <StatusIcon className={`h-3 w-3 mr-1 ${currentMeeting.status === 'processing' ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
        </div>

        {currentMeeting.attendees && currentMeeting.attendees.length > 0 && (
          <div className="flex items-center gap-2 pt-3 border-t border-[#2d3a52]/50">
            <Users className="h-4 w-4 text-[#64748b] shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {currentMeeting.attendees.map((name, i) => (
                <span key={i} className="text-xs bg-[#2d3a52] text-[#94a3b8] px-2 py-1 rounded">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {currentMeeting.ai_model && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[#2d3a52]/50 text-xs text-[#64748b]">
            <span>Model: {currentMeeting.ai_model}</span>
            {currentMeeting.ai_tokens_used && <span>{currentMeeting.ai_tokens_used.toLocaleString()} tokens</span>}
            {currentMeeting.processed_at && <span>Processed: {formatDateTime(currentMeeting.processed_at)}</span>}
          </div>
        )}
      </div>

      {/* ── Process/Retry button for pending/failed ── */}
      {(currentMeeting.status === 'pending' || currentMeeting.status === 'failed') && (
        <div className="card-premium p-5 text-center">
          {currentMeeting.status === 'failed' && currentMeeting.error_message && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 mb-4">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-red-400 text-sm text-left">{currentMeeting.error_message}</p>
            </div>
          )}
          <p className="text-[#64748b] mb-3">
            {currentMeeting.status === 'pending'
              ? 'This meeting has not been processed yet. Click below to generate minutes with AI.'
              : 'Processing failed. Click below to retry.'}
          </p>
          <button onClick={handleProcess} disabled={processing} className="btn-gold inline-flex items-center gap-2 px-6 py-2.5">
            {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <>{currentMeeting.status === 'failed' ? 'Retry' : 'Process Now'}</>}
          </button>
        </div>
      )}

      {/* ── Skipped notice ── */}
      {currentMeeting.status === 'skipped' && (
        <div className="card-premium p-5 text-center">
          <SkipForward className="h-8 w-8 text-[#64748b] mx-auto mb-2" />
          <p className="text-[#64748b]">
            {currentMeeting.error_message || 'This meeting was skipped — the transcript was too short or empty.'}
          </p>
          <button onClick={handleRegenerate} disabled={regenerating} className="btn-gold inline-flex items-center gap-2 px-4 py-2 mt-3">
            {regenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> Re-fetching...</> : <><RefreshCw className="h-4 w-4" /> Re-fetch & Process</>}
          </button>
        </div>
      )}

      {/* ── Minutes Panel ── */}
      {currentMeeting.minutes_markdown && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2d3a52] flex items-center justify-between">
            <h2 className="text-white font-semibold">Meeting Minutes</h2>
            <div className="flex items-center gap-2">
              {!editing && (
                <>
                  <button onClick={() => { setEditText(currentMeeting.minutes_markdown || ''); setEditing(true); }} className="btn-navy text-xs px-3 py-1.5 flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={handleRegenerate} disabled={regenerating} className="btn-navy text-xs px-3 py-1.5 flex items-center gap-1.5">
                    {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Regenerate
                  </button>
                </>
              )}
              {editing && (
                <>
                  <button onClick={handleSave} disabled={saving} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1.5">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-navy text-xs px-3 py-1.5 flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="p-5">
            {editing ? (
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg p-4 text-sm text-[#c8d1df] font-mono leading-relaxed focus:border-[#d4af37] focus:outline-none min-h-[400px] resize-y"
              />
            ) : (
              <div className="prose-custom leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentMeeting.minutes_markdown) }} />
            )}
          </div>
        </div>
      )}

      {/* ── Action Items ── */}
      {actionItems.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2d3a52] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-semibold">
                Action Items <span className="text-[#d4af37] text-sm font-normal ml-1">({actionItems.length})</span>
              </h2>
              {/* Task progress summary */}
              {hasLinkedItems && tasksCreated > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {tasksCompleted > 0 && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle className="h-3 w-3" /> {tasksCompleted} done
                    </span>
                  )}
                  {tasksCreated - tasksCompleted > 0 && (
                    <span className="text-[#64748b]">{tasksCreated - tasksCompleted} open</span>
                  )}
                  {tasksFailed > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertTriangle className="h-3 w-3" /> {tasksFailed} failed
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Create Tasks button — show if any items are unlinked */}
              {(!allLinked || tasksUnlinked > 0) && (
                <button
                  onClick={handleCreateTasks}
                  disabled={creatingTasks}
                  className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {creatingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListTodo className="h-3.5 w-3.5" />}
                  Create Tasks
                </button>
              )}
              {/* Retry failed */}
              {tasksFailed > 0 && (
                <button
                  onClick={handleRetryTasks}
                  disabled={retryingTasks}
                  className="btn-navy text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  {retryingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Retry Failed
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-[#2d3a52]/50">
            {actionItems.map((item: any, i: number) => {
              const prio = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium;
              const isLinked = item.link_status === 'created' && item.task_id;
              const isFailed = item.link_status === 'failed';
              const taskSt = item.task_status ? TASK_STATUS_STYLES[item.task_status] : null;
              const isDone = item.task_status === 'Done';

              return (
                <div key={item.id || i} className={`px-5 py-4 hover:bg-[#1a2744]/30 transition-colors ${isDone ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Status indicator */}
                      {isDone ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Target className="h-4 w-4 text-[#d4af37] shrink-0 mt-0.5" />
                      )}
                      <h3 className={`font-medium text-sm ${isDone ? 'text-[#94a3b8] line-through' : 'text-white'}`}>
                        {item.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Task status badge */}
                      {taskSt && (
                        <span className={`text-[10px] font-medium ${taskSt.color}`}>{taskSt.label}</span>
                      )}
                      {isFailed && (
                        <Badge variant="danger">Failed</Badge>
                      )}
                      <Badge variant={prio.variant}>{prio.label}</Badge>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-[#94a3b8] text-sm ml-6 mb-2">{item.description}</p>
                  )}

                  {/* Failed error message */}
                  {isFailed && item.error_message && (
                    <p className="text-red-400/70 text-xs ml-6 mb-2">{item.error_message}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 ml-6 text-xs text-[#64748b]">
                    {item.assigned_to && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {item.assigned_to}
                      </span>
                    )}
                    {item.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {item.deadline}
                      </span>
                    )}
                    {item.agency && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span className="text-[#d4af37]">{item.agency}</span>
                      </span>
                    )}
                    {/* Link to Notion task */}
                    {isLinked && (
                      <a
                        href={`https://notion.so/${(item.task_id as string).replace(/-/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[#d4af37] hover:text-[#e5c04b] transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" /> View Task
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transcript Drawer ── */}
      {currentMeeting.raw_transcript && (
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
                {currentMeeting.raw_transcript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
