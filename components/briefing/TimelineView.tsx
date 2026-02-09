'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { format, parseISO, isBefore, isToday as isTodayFn } from 'date-fns';
import { MapPin, Video, Users, Clock } from 'lucide-react';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { formatDuration, getEventDurationMinutes, isCurrentlyHappening, getVideoLink } from '@/lib/calendar-utils';

interface TimelineViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  selectedDate?: Date | null;
}

const TIMELINE_START = 7;
const TIMELINE_END = 20;
const HOUR_HEIGHT = 60;
const TOTAL_HEIGHT = (TIMELINE_END - TIMELINE_START) * HOUR_HEIGHT;
const MIN_EVENT_HEIGHT = 40;
const COL_GAP = 3; // px between side-by-side columns
const MAX_COLUMNS = 4;

const CATEGORY_STYLES: Record<EventCategory, { bg: string; border: string; extra?: string }> = {
  ministry: { bg: 'bg-[#4a5568]/20', border: 'border-l-[#4a5568]' },
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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function StatusDot({ status }: { status?: string }) {
  if (status === 'confirmed') return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Confirmed" />;
  if (status === 'tentative') return <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" title="Tentative" />;
  return <span className="w-2 h-2 rounded-full bg-[#64748b] inline-block" title="Needs action" />;
}

// ── Collision Layout Engine ────────────────────────────────────────────────

interface EventSlot {
  event: CalendarEvent;
  startMin: number; // minutes from midnight
  endMin: number;
}

interface LayoutInfo {
  column: number;
  totalColumns: number;
}

function eventsOverlap(a: EventSlot, b: EventSlot): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** Group events into transitive collision clusters */
function buildClusters(slots: EventSlot[]): EventSlot[][] {
  if (slots.length === 0) return [];

  const sorted = [...slots].sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));
  const visited = new Set<number>();
  const clusters: EventSlot[][] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (visited.has(i)) continue;
    const cluster: EventSlot[] = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const idx = queue.shift()!;
      cluster.push(sorted[idx]);
      for (let j = 0; j < sorted.length; j++) {
        if (!visited.has(j) && eventsOverlap(sorted[idx], sorted[j])) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    cluster.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));
    clusters.push(cluster);
  }

  return clusters;
}

/** Assign columns within a cluster using greedy left-to-right */
function assignColumns(cluster: EventSlot[]): Map<string, LayoutInfo> {
  const result = new Map<string, LayoutInfo>();
  // columns[i] = end minute of the last event placed in column i
  const columns: number[] = [];

  for (const slot of cluster) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (columns[col] <= slot.startMin) {
        columns[col] = slot.endMin;
        result.set(slot.event.google_id, { column: col, totalColumns: 0 });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const col = Math.min(columns.length, MAX_COLUMNS - 1);
      if (col === columns.length) {
        columns.push(slot.endMin);
      } else {
        columns[col] = Math.max(columns[col], slot.endMin);
      }
      result.set(slot.event.google_id, { column: col, totalColumns: 0 });
    }
  }

  const totalCols = columns.length;
  result.forEach((info) => { info.totalColumns = totalCols; });
  return result;
}

/** Compute full layout: returns a Map from event google_id to layout info */
function computeLayout(events: CalendarEvent[]): Map<string, LayoutInfo> {
  const slots: EventSlot[] = events.map(e => {
    const start = parseISO(e.start_time!);
    const end = parseISO(e.end_time!);
    return {
      event: e,
      startMin: start.getHours() * 60 + start.getMinutes(),
      endMin: end.getHours() * 60 + end.getMinutes(),
    };
  });

  const clusters = buildClusters(slots);
  const layoutMap = new Map<string, LayoutInfo>();

  for (const cluster of clusters) {
    const clusterLayout = assignColumns(cluster);
    clusterLayout.forEach((v, k) => layoutMap.set(k, v));
  }

  return layoutMap;
}

// ── Mobile overlap detection ───────────────────────────────────────────────

function getMobileOverlaps(events: CalendarEvent[]): Map<string, string[]> {
  const overlaps = new Map<string, string[]>();
  const timed = events.filter(e => e.start_time && e.end_time && !e.all_day);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const aStart = parseISO(timed[i].start_time!);
      const aEnd = parseISO(timed[i].end_time!);
      const bStart = parseISO(timed[j].start_time!);
      const bEnd = parseISO(timed[j].end_time!);
      if (isBefore(aStart, bEnd) && isBefore(bStart, aEnd)) {
        if (!overlaps.has(timed[i].google_id)) overlaps.set(timed[i].google_id, []);
        if (!overlaps.has(timed[j].google_id)) overlaps.set(timed[j].google_id, []);
        overlaps.get(timed[i].google_id)!.push(timed[j].title);
        overlaps.get(timed[j].google_id)!.push(timed[i].title);
      }
    }
  }
  return overlaps;
}

// ── Component ──────────────────────────────────────────────────────────────

export function TimelineView({ events, onEventClick, selectedDate }: TimelineViewProps) {
  const [now, setNow] = useState(new Date());
  const nowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Collapse expanded event on outside click
  useEffect(() => {
    if (!expandedId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-event-block]')) setExpandedId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [expandedId]);

  const timedEvents = events.filter(e => e.start_time && e.end_time && !e.all_day);
  const hours = Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => TIMELINE_START + i);

  const emptyLabel = selectedDate && !isTodayFn(selectedDate)
    ? `No events on ${format(selectedDate, 'EEEE')}`
    : 'No events today';

  const nowHour = now.getHours();
  const nowMinutes = now.getMinutes();
  const nowTop = (nowHour - TIMELINE_START) * HOUR_HEIGHT + nowMinutes;
  const viewingToday = !selectedDate || isTodayFn(selectedDate);
  const showNowMarker = viewingToday && nowHour >= TIMELINE_START && nowHour < TIMELINE_END;

  // Compute layout for desktop
  const layout = useMemo(() => computeLayout(timedEvents), [timedEvents]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    onEventClick(event);
  }, [onEventClick]);

  // Mobile: flat list with overlap indicators
  if (isMobile) {
    const sorted = [...timedEvents].sort((a, b) =>
      parseISO(a.start_time!).getTime() - parseISO(b.start_time!).getTime()
    );

    if (sorted.length === 0) {
      return (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-[#4a5568] mx-auto mb-3" />
          <p className="text-[#64748b]">{emptyLabel} &mdash; your schedule is clear</p>
        </div>
      );
    }

    const mobileOverlaps = getMobileOverlaps(sorted);

    return (
      <div className="space-y-2">
        {sorted.map(event => {
          const category = detectEventCategory(event);
          const styles = CATEGORY_STYLES[category];
          const happening = isCurrentlyHappening(event);
          const duration = getEventDurationMinutes(event);
          const videoLink = getVideoLink(event);
          const overlappingNames = mobileOverlaps.get(event.google_id);
          const hasConflict = overlappingNames && overlappingNames.length > 0;

          return (
            <div key={event.google_id}>
              <button
                onClick={() => handleEventClick(event)}
                className={`w-full text-left p-3 rounded-xl border-l-4 ${styles.bg} ${styles.border} ${styles.extra || ''} ${
                  happening ? 'ring-2 ring-[#d4af37]/50 animate-pulse-gold' : ''
                } transition-all hover:brightness-110 relative`}
              >
                {hasConflict && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" title="Scheduling conflict" />
                )}
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
              {hasConflict && (
                <p className="text-[10px] text-red-400/80 ml-4 mt-0.5 mb-0.5">
                  Overlaps with {overlappingNames!.slice(0, 2).join(', ')}{overlappingNames!.length > 2 ? ` +${overlappingNames!.length - 2}` : ''}
                </p>
              )}
            </div>
          );
        })}
        <CategoryLegend />
      </div>
    );
  }

  // Desktop: positioned timeline with collision layout
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

          {/* Event blocks — rendered inside a relative container offset by hour labels */}
          <div className="absolute left-16 right-2 top-0 bottom-0">
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
              const height = Math.max(MIN_EVENT_HEIGHT, duration);

              const info = layout.get(event.google_id);
              const col = info?.column ?? 0;
              const totalCols = info?.totalColumns ?? 1;
              const isMultiCol = totalCols > 1;
              const isExpanded = expandedId === event.google_id;

              // Width and position as percentages
              const colWidthPct = isExpanded ? 100 : (100 / totalCols);
              const leftPct = isExpanded ? 0 : (col * colWidthPct);
              const gapOffset = isMultiCol && !isExpanded ? COL_GAP / 2 : 0;

              // Determine content level based on column count
              const isNarrow = totalCols >= 3 && !isExpanded;
              const isMedium = totalCols === 2 && !isExpanded;

              return (
                <button
                  key={event.google_id}
                  data-event-block
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isMultiCol && !isExpanded) {
                      setExpandedId(event.google_id);
                    } else {
                      setExpandedId(null);
                      handleEventClick(event);
                    }
                  }}
                  className={`absolute rounded-lg border-l-4 ${styles.bg} ${styles.border} ${styles.extra || ''} ${
                    happening ? 'ring-2 ring-[#d4af37]/50 animate-pulse-gold' : ''
                  } text-left transition-all duration-200 ${
                    isExpanded
                      ? 'z-30 brightness-125 ring-1 ring-white/20 shadow-lg shadow-black/40'
                      : isMultiCol ? 'z-10 hover:z-20 hover:brightness-110' : 'z-10 hover:brightness-110'
                  }`}
                  style={{
                    top,
                    height,
                    left: `calc(${leftPct}% + ${isExpanded ? 0 : col > 0 ? gapOffset : 0}px)`,
                    width: `calc(${colWidthPct}% - ${isMultiCol && !isExpanded ? COL_GAP : 0}px)`,
                    ...(isMultiCol && col > 0 && !isExpanded ? { boxShadow: '-1px 0 3px rgba(0,0,0,0.3)' } : {}),
                  }}
                >
                  <div className="p-1.5 h-full flex flex-col overflow-hidden">
                    {/* Conflict dot */}
                    {isMultiCol && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    )}

                    {/* Title — always visible */}
                    <p className={`font-medium text-white shrink-0 ${isNarrow ? 'text-[10px] truncate' : 'text-xs truncate'}`}>
                      {event.title}
                    </p>

                    {/* Time — narrow shows start only */}
                    <p className="text-[10px] text-[#94a3b8] shrink-0">
                      {isNarrow
                        ? format(start, 'h:mm a')
                        : `${format(start, 'h:mm a')} \u2013 ${format(end, 'h:mm a')}`
                      }
                    </p>

                    {/* Medium (2-col) or full width: duration + extras */}
                    {!isNarrow && duration >= 45 && (
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#64748b] flex-wrap">
                        <span>{formatDuration(duration)}</span>
                        {event.location && !isMedium && (
                          <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{event.location}</span>
                        )}
                        {videoLink && (isExpanded || !isMedium) && <Video className="h-2.5 w-2.5 text-[#d4af37]" />}
                        {event.attendees && event.attendees.length > 0 && (
                          <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{event.attendees.length}</span>
                        )}
                      </div>
                    )}

                    {/* Full width or expanded: description + avatars */}
                    {(!isMultiCol || isExpanded) && duration >= 60 && (
                      <div className="mt-1 flex-1 min-h-0">
                        {event.description && (
                          <p className="text-[10px] text-[#64748b] line-clamp-2">
                            {stripHtml(event.description).slice(0, 80)}
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

          {/* NOW marker — above event blocks */}
          {showNowMarker && (
            <div
              ref={nowRef}
              className="absolute left-0 right-0 z-30 pointer-events-none"
              style={{ top: nowTop }}
            >
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#d4af37] -ml-1.5 flex-shrink-0" />
                <div className="flex-1 h-0.5 bg-[#d4af37]" />
              </div>
            </div>
          )}
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
