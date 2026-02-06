'use client';

import { format, parseISO, formatDistanceToNowStrict, isAfter } from 'date-fns';
import { Clock, MapPin, Video, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { CalendarEvent, detectEventCategory } from '@/lib/calendar-types';
import { getVideoLink } from '@/lib/calendar-utils';

interface MeetingPrepCardProps {
  events: CalendarEvent[];
  onJoinCall?: (url: string) => void;
}

const CATEGORY_BADGES: Record<string, { label: string; className: string }> = {
  ministry: { label: 'Ministry', className: 'badge-info' },
  board: { label: 'Board', className: 'badge-gold' },
  external: { label: 'External', className: 'bg-teal-500/20 text-teal-400 border border-teal-500/30' },
  personal: { label: 'Personal', className: 'badge-info' },
  blocked: { label: 'Blocked', className: 'bg-[#2d3a52]/50 text-[#94a3b8] border border-[#2d3a52]' },
};

const AGENCY_PATTERNS: Array<{ pattern: RegExp; slug: string; name: string }> = [
  { pattern: /\bgpl\b/i, slug: 'gpl', name: 'GPL' },
  { pattern: /\bgwi\b/i, slug: 'gwi', name: 'GWI' },
  { pattern: /\bcjia\b/i, slug: 'cjia', name: 'CJIA' },
  { pattern: /\bgcaa\b/i, slug: 'gcaa', name: 'GCAA' },
];

function detectAgency(event: CalendarEvent): { slug: string; name: string } | null {
  const text = `${event.title} ${event.description || ''}`;
  for (const ap of AGENCY_PATTERNS) {
    if (ap.pattern.test(text)) return { slug: ap.slug, name: ap.name };
  }
  return null;
}

export function MeetingPrepCard({ events, onJoinCall }: MeetingPrepCardProps) {
  const now = new Date();
  const upcoming = events
    .filter(e => e.start_time && !e.all_day && isAfter(parseISO(e.start_time), now))
    .sort((a, b) => parseISO(a.start_time!).getTime() - parseISO(b.start_time!).getTime())
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Meeting Prep
      </h3>
      {upcoming.map(event => {
        const category = detectEventCategory(event);
        const badge = CATEGORY_BADGES[category];
        const videoLink = getVideoLink(event);
        const agency = detectAgency(event);

        return (
          <div
            key={event.google_id}
            className="p-4 rounded-xl bg-[#1a2744]/50 border border-[#2d3a52]/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{event.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  {event.start_time && (
                    <span className="text-xs text-[#d4af37]">
                      in {formatDistanceToNowStrict(parseISO(event.start_time))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-[#64748b]">
              {event.start_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(parseISO(event.start_time), 'h:mm a')}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </span>
              )}
              {event.attendees && event.attendees.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {event.attendees.filter(a => !a.self).map(a => a.display_name || a.email.split('@')[0]).slice(0, 2).join(', ')}
                  {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              {videoLink && onJoinCall && (
                <button
                  onClick={() => onJoinCall(videoLink)}
                  className="btn-gold text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <Video className="h-3 w-3" />
                  Join Call
                </button>
              )}
              {agency && (
                <Link
                  href={`/intel/${agency.slug}`}
                  className="flex items-center gap-1 text-xs text-[#d4af37] hover:underline"
                >
                  View {agency.name} Dashboard
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
