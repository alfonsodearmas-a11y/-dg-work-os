'use client';

import { useMemo } from 'react';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { Calendar, Clock, Video, MapPin } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { CalendarEvent, detectEventCategory, EventCategory } from '@/lib/calendar-types';
import { calculateDayStats, getNextEvent, getVideoLink } from '@/lib/calendar-utils';

interface DayAtGlanceProps {
  events: CalendarEvent[];
  weekEvents: CalendarEvent[];
  onJoinNextCall?: (url: string) => void;
}

const CATEGORY_COLORS: Record<EventCategory, string> = {
  ministry: '#4a5568',
  board: '#d4af37',
  external: '#14b8a6',
  personal: '#64748b',
  blocked: '#2d3a52',
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  ministry: 'Ministry',
  board: 'Board',
  external: 'External',
  personal: 'Personal',
  blocked: 'Blocked',
};

export function DayAtGlance({ events, weekEvents, onJoinNextCall }: DayAtGlanceProps) {
  const stats = useMemo(() => calculateDayStats(events), [events]);
  const nextEvent = useMemo(() => getNextEvent(events), [events]);
  const nextVideoLink = nextEvent ? getVideoLink(nextEvent) : null;

  const weekMeetings = weekEvents.filter(e => !e.all_day).length;
  const weekHours = useMemo(() => {
    const ws = calculateDayStats(weekEvents);
    return ws.total_hours;
  }, [weekEvents]);

  // Pie chart data — only categories with > 0 hours
  const pieData = useMemo(() => {
    return (Object.entries(stats.hours_by_category) as [EventCategory, number][])
      .filter(([, hours]) => hours > 0)
      .map(([category, hours]) => ({
        name: CATEGORY_LABELS[category],
        value: Math.round(hours * 10) / 10,
        color: CATEGORY_COLORS[category],
      }));
  }, [stats]);

  return (
    <div className="card-premium p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Stats */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#94a3b8] uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today at a Glance
          </h3>
          <div className="space-y-3">
            <div>
              <p className="stat-number">{stats.total_events}</p>
              <p className="text-[#64748b] text-sm mt-0.5">
                meeting{stats.total_events !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-xl font-semibold text-[#d4af37]">{stats.total_hours}h</p>
                <p className="text-xs text-[#64748b]">booked</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-emerald-400">{stats.free_hours}h</p>
                <p className="text-xs text-[#64748b]">free</p>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Donut chart */}
        <div className="flex flex-col items-center justify-center">
          {pieData.length > 0 ? (
            <>
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] text-[#64748b]">{d.name} {d.value}h</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center">
              <Clock className="h-8 w-8 text-[#4a5568] mx-auto mb-2" />
              <p className="text-xs text-[#64748b]">No meetings today</p>
            </div>
          )}
        </div>

        {/* Right: Next meeting */}
        <div>
          {nextEvent ? (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52]">
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">Next Meeting</p>
              <p className="text-sm font-medium text-white">{nextEvent.title}</p>
              {nextEvent.start_time && (
                <>
                  <p className="text-xs text-[#94a3b8] mt-1">
                    {format(parseISO(nextEvent.start_time), 'h:mm a')}
                    {nextEvent.end_time && ` \u2013 ${format(parseISO(nextEvent.end_time), 'h:mm a')}`}
                  </p>
                  <p className="text-xs text-[#d4af37] mt-1">
                    in {formatDistanceToNowStrict(parseISO(nextEvent.start_time))}
                  </p>
                </>
              )}
              {nextEvent.location && (
                <p className="text-xs text-[#64748b] mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{nextEvent.location}
                </p>
              )}
              {nextVideoLink && onJoinNextCall && (
                <button
                  onClick={() => onJoinNextCall(nextVideoLink)}
                  className="btn-gold text-xs py-1.5 px-4 mt-3 w-full flex items-center justify-center gap-1.5"
                >
                  <Video className="h-3.5 w-3.5" />
                  Join Call
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52] text-center">
              <p className="text-xs text-[#64748b]">No more meetings today</p>
              <p className="text-lg font-semibold text-emerald-400 mt-1">All clear</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom strip */}
      <div className="mt-3 md:mt-4 pt-3 border-t border-[#2d3a52]/50 flex items-center gap-3 md:gap-4 text-xs text-[#64748b]">
        <span>{weekMeetings} meetings this week</span>
        <span className="text-[#2d3a52]">&bull;</span>
        <span>{weekHours}h total</span>
      </div>
    </div>
  );
}
