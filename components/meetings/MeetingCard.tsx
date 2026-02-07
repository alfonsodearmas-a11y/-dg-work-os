'use client';

import Link from 'next/link';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  SkipForward,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface TaskSummary {
  total: number;
  created: number;
  completed: number;
  failed: number;
}

export interface MeetingCardData {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  category: string | null;
  status: string;
  ai_tokens_used: number | null;
  action_items: any[];
  task_summary?: TaskSummary;
}

const STATUS_CONFIG: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning' | 'gold'; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { variant: 'success', label: 'Minutes Ready', icon: CheckCircle },
  processing: { variant: 'warning', label: 'Processing...', icon: Loader2 },
  pending: { variant: 'default', label: 'Pending', icon: Clock },
  failed: { variant: 'danger', label: 'Failed', icon: AlertTriangle },
  skipped: { variant: 'default', label: 'Skipped', icon: SkipForward },
  edited: { variant: 'info', label: 'Edited', icon: Pencil },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function MeetingCard({ meeting }: { meeting: MeetingCardData }) {
  const config = STATUS_CONFIG[meeting.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const time = formatTime(meeting.meeting_date);
  const actionCount = Array.isArray(meeting.action_items) ? meeting.action_items.length : 0;

  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div className="card-premium p-4 hover:brightness-125 hover:border-[#d4af37]/30 transition-all duration-200 cursor-pointer touch-active h-full flex flex-col">
        {/* Status + Category */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <Badge variant={config.variant}>
            <StatusIcon className={`h-3 w-3 mr-1 ${meeting.status === 'processing' ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
          {meeting.category && (
            <span className="text-[10px] text-[#d4af37] bg-[#d4af37]/10 px-2 py-0.5 rounded font-medium">
              {meeting.category}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 mb-2 flex-1">
          {meeting.title}
        </h3>

        {/* Date + Time */}
        <div className="flex items-center gap-2 text-[#64748b] text-xs mb-2">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>{formatDate(meeting.meeting_date)}</span>
          {time && <span className="text-[#94a3b8]">{time}</span>}
        </div>

        {/* Attendees */}
        {meeting.attendees && meeting.attendees.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-[#64748b] shrink-0" />
            <div className="flex items-center gap-1 overflow-hidden">
              {meeting.attendees.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#2d3a52] text-[9px] text-[#94a3b8] font-medium shrink-0"
                  title={name}
                >
                  {getInitials(name)}
                </span>
              ))}
              {meeting.attendees.length > 3 && (
                <span className="text-[#64748b] text-xs">+{meeting.attendees.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* Action items + task progress */}
        {actionCount > 0 && (
          <div className="mt-auto pt-2 border-t border-[#2d3a52]/50 flex items-center justify-between">
            <span className="text-[#d4af37] text-xs font-medium">
              {actionCount} action item{actionCount !== 1 ? 's' : ''}
            </span>
            {meeting.task_summary && meeting.task_summary.created > 0 && (
              <span className="text-xs text-[#64748b]">
                {meeting.task_summary.completed > 0 && (
                  <span className="text-emerald-400">{meeting.task_summary.completed} done</span>
                )}
                {meeting.task_summary.completed > 0 && meeting.task_summary.created - meeting.task_summary.completed > 0 && (
                  <span className="text-[#64748b]"> / </span>
                )}
                {meeting.task_summary.created - meeting.task_summary.completed > 0 && (
                  <span>{meeting.task_summary.created - meeting.task_summary.completed} open</span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
