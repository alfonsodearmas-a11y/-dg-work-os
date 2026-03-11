/**
 * Utility functions for the Meetings page.
 * Extracted from app/meetings/page.tsx for reusability and cleaner module boundaries.
 */

/**
 * Format a duration in seconds to a human-readable string (e.g. "1h 23m" or "45m").
 */
export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Format a timestamp in seconds to a timecode string (e.g. "1:02:34" or "2:34").
 */
export function formatTimestamp(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Meeting processing status values.
 */
export type MeetingStatus = 'UPLOADED' | 'TRANSCRIBING' | 'TRANSCRIBED' | 'ANALYZING' | 'ANALYZED' | 'ERROR';

/**
 * Configuration for rendering status badges per meeting status.
 */
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
