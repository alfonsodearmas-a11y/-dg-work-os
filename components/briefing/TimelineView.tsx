'use client';

import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MapPin, Video, Users, Clock } from 'lucide-react';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { formatDuration, getEventDurationMinutes, isCurrentlyHappening, getVideoLink } from '@/lib/calendar-utils';

interface TimelineViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

const TIMELINE_START = 7;
const TIMELINE_END = 20;
const HOUR_HEIGHT = 60;
const TOTAL_HEIGHT = (TIMELINE_END - TIMELINE_START) * HOUR_HEIGHT;

const CATEGORY_STYLES: Record<EventCategory, { bg: string; border: string; extra?: string }> = {
  ministry: { bg: 'bg-[#1a2744]', border: 'border-l-[#4a5568]' },
  board: { bg: 'bg-[#d4af37]/15', border: 'border-l-[#d4af37]' },
  external: { bg: 'bg-teal-500/15', border: 'border-l-teal-500' },
  personal: { bg: 'bg-[#64748b]/15', border: 'border-l-[#64748b]' },
  blocked: { bg: 'bg-[#2d3a52]/30', border: 'border-l-[#64748b]', extra: 'border-dashed event-block-striped' },
};

const CATEGORY_LABELS: Record<EventCategory, { label: string; color: string }> = {
  ministry: { label: 'Ministry', color: 'bg-[#4a5568]' },
  board: { label: 'Board', color: 'bg-[#d4af37]' },
  external: { label: 'External', color: 'bg-teal-500' },
  personal: { label: 'Personal', color: 'bg-[#64748b]' },
  blocked: { label: 'Blocked', color: 'bg-[#2d3a52]' },
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600'];

function StatusDot({ status }: { status?: string }) {
  if (status === 'confirmed') return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Confirmed" />;
  if (status === 'tentative') return <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" title="Tentative" />;
  return <span className="w-2 h-2 rounded-full bg-[#64748b] inline-block" title="Needs action" />;
}

export function TimelineView({ events, onEventClick }: TimelineViewProps) {
  const [now, setNow] = useState(new Date());
  const nowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isMobile]);

  const timedEvents = events.filter(e => e.start_time && e.end_time && !e.all_day);
  const hours = Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => TIMELINE_START + i);

  const nowHour = now.getHours();
  const nowMinutes = now.getMinutes();
  const nowTop = (nowHour - TIMELINE_START) * HOUR_HEIGHT + nowMinutes;
  const showNowMarker = nowHour >= TIMELINE_START && nowHour < TIMELINE_END;

  // Mobile: flat list
  if (isMobile) {
    const sorted = [...timedEvents].sort((a, b) =>
      parseISO(a.start_time!).getTime() - parseISO(b.start_time!).getTime()
    );

    if (sorted.length === 0) {
      return (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-[#4a5568] mx-auto mb-3" />
          <p className="text-[#64748b]">No events today &mdash; your schedule is clear</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {sorted.map(event => {
          const category = detectEventCategory(event);
          const styles = CATEGORY_STYLES[category];
          const happening = isCurrentlyHappening(event);
          const duration = getEventDurationMinutes(event);
          const videoLink = getVideoLink(event);

          return (
            <button
              key={event.google_id}
              onClick={() => onEventClick(event)}
              className={`w-full text-left p-3 rounded-xl border-l-4 ${styles.bg} ${styles.border} ${styles.extra || ''} ${
                happening ? 'ring-2 ring-[#d4af37]/50 animate-pulse-gold' : ''
              } transition-all hover:brightness-110`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{event.title}</p>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    {format(parseISO(event.start_time!), 'h:mm a')} &ndash; {format(parseISO(event.end_time!), 'h:mm a')}
                    <span className="text-[#64748b] ml-2">{formatDuration(duration)}</span>
                  </p>
                </div>
                <StatusDot status={event.status} />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-[#64748b]">
                {event.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>
                )}
                {videoLink && (
                  <span className="flex items-center gap-1 text-[#d4af37]"><Video className="h-3 w-3" />Video</span>
                )}
                {event.attendees && event.attendees.length > 0 && (
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{event.attendees.length}</span>
                )}
              </div>
            </button>
          );
        })}
        <CategoryLegend />
      </div>
    );
  }

  // Desktop: positioned timeline
  if (timedEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="h-12 w-12 text-[#4a5568] mx-auto mb-3" />
        <p className="text-[#64748b]">No events today &mdash; your schedule is clear</p>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="relative overflow-y-auto max-h-[600px] pr-2" style={{ minHeight: 400 }}>
        <div className="relative" style={{ height: TOTAL_HEIGHT }}>
          {/* Hour grid lines + labels */}
          {hours.map(hour => {
            const top = (hour - TIMELINE_START) * HOUR_HEIGHT;
            return (
              <div key={hour} className="absolute left-0 right-0" style={{ top }}>
                <div className="flex items-start">
                  <span className="w-14 text-xs font-mono text-[#64748b] flex-shrink-0 -mt-2">
                    {format(new Date(2000, 0, 1, hour), 'h a')}
                  </span>
                  <div className="flex-1 border-t border-[#2d3a52]/50" />
                </div>
              </div>
            );
          })}

          {/* NOW marker */}
          {showNowMarker && (
            <div
              ref={nowRef}
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: nowTop }}
            >
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#d4af37] -ml-1.5 flex-shrink-0" />
                <div className="flex-1 h-0.5 bg-[#d4af37]" />
              </div>
            </div>
          )}

          {/* Event blocks */}
          {timedEvents.map(event => {
            const start = parseISO(event.start_time!);
            const end = parseISO(event.end_time!);
            const startHour = start.getHours();
            const startMin = start.getMinutes();
            const duration = getEventDurationMinutes(event);
            const category = detectEventCategory(event);
            const styles = CATEGORY_STYLES[category];
            const happening = isCurrentlyHappening(event);
            const videoLink = getVideoLink(event);

            const top = (startHour - TIMELINE_START) * HOUR_HEIGHT + startMin;
            const height = Math.max(30, duration);

            return (
              <button
                key={event.google_id}
                onClick={() => onEventClick(event)}
                className={`absolute left-16 right-2 rounded-lg border-l-4 ${styles.bg} ${styles.border} ${styles.extra || ''} ${
                  happening ? 'ring-2 ring-[#d4af37]/50 animate-pulse-gold' : ''
                } transition-all hover:brightness-110 overflow-hidden text-left z-10`}
                style={{ top, height }}
              >
                <div className="p-2 h-full flex flex-col">
                  {/* Always show: title + time */}
                  <p className="text-xs font-medium text-white truncate">{event.title}</p>
                  <p className="text-[10px] text-[#94a3b8]">
                    {format(start, 'h:mm a')} &ndash; {format(end, 'h:mm a')}
                  </p>

                  {/* >= 45min: duration, location, video, attendees */}
                  {duration >= 45 && (
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[#64748b] flex-wrap">
                      <span>{formatDuration(duration)}</span>
                      {event.location && (
                        <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{event.location}</span>
                      )}
                      {videoLink && <Video className="h-2.5 w-2.5 text-[#d4af37]" />}
                      {event.attendees && event.attendees.length > 0 && (
                        <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{event.attendees.length}</span>
                      )}
                    </div>
                  )}

                  {/* >= 60min: description preview, status, attendee avatars */}
                  {duration >= 60 && (
                    <div className="mt-1 flex-1 min-h-0">
                      {event.description && (
                        <p className="text-[10px] text-[#64748b] line-clamp-2">
                          {event.description.slice(0, 80)}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <StatusDot status={event.status} />
                        {event.attendees && event.attendees.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {event.attendees.slice(0, 3).map((a, i) => (
                              <div
                                key={a.email}
                                className={`w-5 h-5 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-[8px] font-bold text-white ring-1 ring-[#0a1628]`}
                                title={a.display_name || a.email}
                              >
                                {getInitials(a.display_name || a.email.split('@')[0])}
                              </div>
                            ))}
                            {event.attendees.length > 3 && (
                              <div className="w-5 h-5 rounded-full bg-[#2d3a52] flex items-center justify-center text-[8px] font-bold text-[#94a3b8] ring-1 ring-[#0a1628]">
                                +{event.attendees.length - 3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <CategoryLegend />
    </div>
  );
}

function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#2d3a52]/50">
      {(Object.entries(CATEGORY_LABELS) as [EventCategory, { label: string; color: string }][]).map(([, { label, color }]) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
          <span className="text-[10px] text-[#64748b]">{label}</span>
        </div>
      ))}
    </div>
  );
}
