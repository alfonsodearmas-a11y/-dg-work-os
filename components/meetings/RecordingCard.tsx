'use client';

import Link from 'next/link';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileAudio,
  Mic,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface RecordingCardData {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  status: string;
  duration_seconds: number | null;
  agency: string | null;
  ai_tokens_used: number | null;
  analysis: { action_items?: any[] } | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning' | 'gold'; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { variant: 'success', label: 'Analyzed', icon: CheckCircle },
  processing: { variant: 'warning', label: 'Processing...', icon: Loader2 },
  transcribing: { variant: 'info', label: 'Transcribing...', icon: Loader2 },
  transcribed: { variant: 'info', label: 'Transcribed', icon: FileAudio },
  uploading: { variant: 'default', label: 'Uploading', icon: Clock },
  recording: { variant: 'gold', label: 'Recording...', icon: Mic },
  failed: { variant: 'danger', label: 'Failed', icon: AlertTriangle },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function RecordingCard({ recording }: { recording: RecordingCardData }) {
  const config = STATUS_CONFIG[recording.status] || STATUS_CONFIG.uploading;
  const StatusIcon = config.icon;
  const isAnimating = recording.status === 'processing' || recording.status === 'transcribing';
  const actionCount = recording.analysis?.action_items?.length || 0;

  return (
    <Link href={`/meetings/recordings/${recording.id}`}>
      <div className="card-premium p-4 hover:brightness-125 hover:border-[#d4af37]/30 transition-all duration-200 cursor-pointer touch-active h-full flex flex-col">
        {/* Status + source badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <Badge variant={config.variant}>
            <StatusIcon className={`h-3 w-3 mr-1 ${isAnimating ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
          <span className="text-[10px] text-[#64748b] bg-[#2d3a52] px-2 py-0.5 rounded font-medium flex items-center gap-1">
            <Mic className="h-2.5 w-2.5" />
            Recording
          </span>
        </div>

        {/* Title */}
        <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 mb-2 flex-1">
          {recording.title}
        </h3>

        {/* Date */}
        <div className="flex items-center gap-2 text-[#64748b] text-xs mb-2">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>{formatDate(recording.meeting_date || recording.created_at)}</span>
        </div>

        {/* Duration + Agency */}
        <div className="flex items-center gap-2 text-xs mb-2">
          {recording.duration_seconds && (
            <span className="flex items-center gap-1 text-[#64748b]">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {Math.floor(recording.duration_seconds / 60)}m {recording.duration_seconds % 60}s
            </span>
          )}
          {recording.agency && (
            <span className="text-[#d4af37] bg-[#d4af37]/10 px-1.5 py-0.5 rounded text-[10px] font-medium">
              {recording.agency}
            </span>
          )}
        </div>

        {/* Attendees */}
        {recording.attendees && recording.attendees.length > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-[#64748b] shrink-0" />
            <div className="flex items-center gap-1 overflow-hidden">
              {recording.attendees.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#2d3a52] text-[9px] text-[#94a3b8] font-medium shrink-0"
                  title={name}
                >
                  {getInitials(name)}
                </span>
              ))}
              {recording.attendees.length > 3 && (
                <span className="text-[#64748b] text-xs">+{recording.attendees.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* Action items count */}
        {actionCount > 0 && (
          <div className="mt-auto pt-2 border-t border-[#2d3a52]/50">
            <span className="text-[#d4af37] text-xs font-medium">
              {actionCount} action item{actionCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
