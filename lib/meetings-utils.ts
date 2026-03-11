/**
 * Types, constants, and utility functions for the Meetings module.
 * Extracted from app/meetings/page.tsx for reusability and cleaner module boundaries.
 */

import { FileText, MessageSquare, ListChecks, StickyNote } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MeetingAction {
  id: string;
  meeting_id: string;
  task: string;
  owner: string | null;
  due_date: string | null;
  done: boolean;
  confidence: 'AUTO_CREATE' | 'NEEDS_REVIEW';
  review_reason: string | null;
  task_id: string | null;
  skipped: boolean;
  created_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Meeting {
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

export type MeetingStatus = 'UPLOADED' | 'TRANSCRIBING' | 'TRANSCRIBED' | 'ANALYZING' | 'ANALYZED' | 'ERROR';

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<MeetingStatus, {
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

// ── Tab config ────────────────────────────────────────────────────────────────

export const MEETING_TABS = [
  { key: 'analysis',   label: 'Analysis',   icon: FileText },
  { key: 'transcript', label: 'Transcript', icon: MessageSquare },
  { key: 'actions',    label: 'Actions',    icon: ListChecks },
  { key: 'notes',      label: 'Notes',      icon: StickyNote },
] as const;

export type MeetingTabKey = typeof MEETING_TABS[number]['key'];

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTimestamp(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Derived data helpers ──────────────────────────────────────────────────────

export function countAnalyzedMeetings(meetings: Meeting[]): number {
  return meetings.filter(m => m.status === 'ANALYZED').length;
}

export function countOpenActions(meetings: Meeting[]): number {
  return meetings.reduce(
    (sum, m) => sum + (m.meeting_actions?.filter(a => !a.done).length || 0),
    0
  );
}

export function filterMeetings(meetings: Meeting[], query: string): Meeting[] {
  if (!query.trim()) return meetings;
  const q = query.toLowerCase();
  return meetings.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.attendees.some(a => a.toLowerCase().includes(q))
  );
}
