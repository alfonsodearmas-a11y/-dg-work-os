'use client';

import Link from 'next/link';
import { Calendar, ChevronRight } from 'lucide-react';
import type { CalendarToday, ScheduleEvent } from '@/lib/today/schedule';

interface TodaysScheduleCardProps {
  schedule: CalendarToday;
}

const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 19;

function hourFraction(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hours = d.getHours() + d.getMinutes() / 60;
  return (hours - TIMELINE_START_HOUR) / (TIMELINE_END_HOUR - TIMELINE_START_HOUR);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function TodaysScheduleCard({ schedule }: TodaysScheduleCardProps) {
  const events = schedule.events ?? [];
  const next = schedule.nextEvent;

  const dotted = events
    .map(e => ({ ev: e, frac: hourFraction(e.start) }))
    .filter((d): d is { ev: ScheduleEvent; frac: number } => d.frac !== null)
    .filter(d => d.frac >= 0 && d.frac <= 1);

  return (
    <article className="card-premium p-4 lg:p-5" aria-label="Today's schedule">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-navy-600" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
            Today&rsquo;s Schedule
          </span>
        </div>
        <span className="text-xs text-navy-600 font-mono">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </header>

      {!schedule.ok ? (
        <p className="text-xs text-navy-600 italic">Calendar unavailable.</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No events scheduled.</p>
      ) : (
        <div>
          <div className="relative h-12 px-1" role="img" aria-label={`${events.length} events between 07:00 and 19:00`}>
            <div className="absolute left-0 right-0 top-1/2 h-px bg-navy-800 -translate-y-1/2" />
            {dotted.map(({ ev, frac }) => {
              const isNext = next && ev.id === next.id;
              const dotColor = isNext ? 'var(--gold-500)' : 'var(--navy-600)';
              const size = isNext ? 11 : 7;
              return (
                <div
                  key={ev.id}
                  className="absolute top-1/2"
                  style={{
                    left: `${frac * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <span
                    className={`block rounded-full ${isNext ? 'animate-pulse-dot' : ''}`}
                    style={{ width: size, height: size, background: dotColor }}
                    aria-hidden="true"
                  />
                  <span
                    className={`absolute left-1/2 top-full mt-2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap ${
                      isNext ? 'text-gold-500 font-semibold' : 'text-navy-600'
                    }`}
                  >
                    {formatTime(ev.start)}
                  </span>
                </div>
              );
            })}
          </div>

          {next && (
            <Link
              href="/calendar"
              className="mt-6 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gold-500/25 bg-gold-500/[0.04] hover:bg-gold-500/[0.08] transition-colors group"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-500">Next</span>
              <span className="font-mono text-xs text-gold-500 tabular-nums">{formatTime(next.start)}</span>
              <span className="text-sm text-white truncate flex-1">{next.title}</span>
              <ChevronRight size={14} className="text-navy-600 group-hover:text-gold-500 transition-colors" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
