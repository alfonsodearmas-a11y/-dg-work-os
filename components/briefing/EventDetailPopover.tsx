'use client';

import { useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  X, MapPin, Video, Users, Clock, AlertTriangle,
  Edit2, Trash2, ExternalLink, Check, HelpCircle, XCircle
} from 'lucide-react';
import { CalendarEvent, detectEventCategory } from '@/lib/calendar-types';
import { formatDuration, getEventDurationMinutes, getVideoLink } from '@/lib/calendar-utils';
import { useState } from 'react';

interface EventDetailPopoverProps {
  event: CalendarEvent;
  conflictingEvents?: CalendarEvent[];
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  onJoinCall?: (url: string) => void;
}

const CATEGORY_BADGES: Record<string, { label: string; className: string }> = {
  ministry: { label: 'Ministry', className: 'badge-info' },
  board: { label: 'Board', className: 'badge-gold' },
  external: { label: 'External', className: 'bg-teal-500/20 text-teal-400 border border-teal-500/30' },
  personal: { label: 'Personal', className: 'badge-info' },
  blocked: { label: 'Blocked', className: 'bg-[#2d3a52]/50 text-[#94a3b8] border border-[#2d3a52]' },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'badge-success' },
  tentative: { label: 'Tentative', className: 'badge-gold' },
  cancelled: { label: 'Cancelled', className: 'badge-danger' },
};

const RSVP_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  accepted: { icon: Check, color: 'text-emerald-400' },
  declined: { icon: XCircle, color: 'text-red-400' },
  tentative: { icon: HelpCircle, color: 'text-amber-400' },
  needsAction: { icon: Clock, color: 'text-[#64748b]' },
};

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600'];

export function EventDetailPopover({
  event,
  conflictingEvents,
  onClose,
  onEdit,
  onDelete,
  onJoinCall,
}: EventDetailPopoverProps) {
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const category = detectEventCategory(event);
  const categoryBadge = CATEGORY_BADGES[category];
  const statusBadge = event.status ? STATUS_BADGES[event.status] : null;
  const duration = getEventDurationMinutes(event);
  const videoLink = getVideoLink(event);

  return (
    <>
      {/* Backdrop */}
      <div className="slide-panel-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-full sm:max-w-[400px] bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-l border-[#2d3a52] shadow-2xl z-50 animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a2744]/95 backdrop-blur-sm border-b border-[#2d3a52] p-3 md:p-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white">{event.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryBadge.className}`}>
                  {categoryBadge.label}
                </span>
                {statusBadge && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-3 md:p-4 space-y-4 md:space-y-5 pb-24 md:pb-4">
          {/* Conflict Warning */}
          {conflictingEvents && conflictingEvents.length > 0 && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Conflicts with {conflictingEvents.length} event{conflictingEvents.length > 1 ? 's' : ''}
              </div>
              <div className="mt-2 space-y-1">
                {conflictingEvents.map(c => (
                  <p key={c.google_id} className="text-xs text-red-400/80">
                    {c.title} ({c.start_time && format(parseISO(c.start_time), 'h:mm a')})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-[#64748b] mt-0.5 flex-shrink-0" />
            <div>
              {event.start_time && (
                <>
                  <p className="text-sm text-white">
                    {format(parseISO(event.start_time), 'EEEE, MMMM d, yyyy')}
                  </p>
                  {!event.all_day && (
                    <p className="text-sm text-[#94a3b8]">
                      {format(parseISO(event.start_time), 'h:mm a')}
                      {event.end_time && ` \u2013 ${format(parseISO(event.end_time), 'h:mm a')}`}
                      <span className="text-[#64748b] ml-2">({formatDuration(duration)})</span>
                    </p>
                  )}
                  {event.all_day && <p className="text-sm text-[#94a3b8]">All day</p>}
                </>
              )}
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-[#64748b] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[#94a3b8]">{event.location}</p>
            </div>
          )}

          {/* Video Call */}
          {videoLink && (
            <div className="flex items-center gap-3">
              <Video className="h-4 w-4 text-[#d4af37] flex-shrink-0" />
              <div className="flex items-center gap-3 flex-1">
                <span className="text-sm text-[#94a3b8]">
                  {event.conference_data?.conference_solution?.name || 'Video Call'}
                </span>
                <button
                  onClick={() => onJoinCall?.(videoLink)}
                  className="btn-gold text-xs py-1.5 px-4"
                >
                  Join Call
                </button>
              </div>
            </div>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-[#64748b]" />
                <span className="text-sm text-[#94a3b8]">{event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {event.attendees.map((attendee, i) => {
                  const rsvp = attendee.response_status ? RSVP_ICON[attendee.response_status] : null;
                  const RsvpIcon = rsvp?.icon;
                  return (
                    <div key={attendee.email} className="flex items-center gap-3 p-2 rounded-lg bg-[#0a1628]/50">
                      <div className={`w-8 h-8 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-xs font-bold text-white`}>
                        {getInitials(attendee.display_name || attendee.email.split('@')[0])}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {attendee.display_name || attendee.email.split('@')[0]}
                          {attendee.organizer && <span className="text-[#d4af37] text-xs ml-1">(organizer)</span>}
                        </p>
                        <p className="text-xs text-[#64748b] truncate">{attendee.email}</p>
                      </div>
                      {RsvpIcon && (
                        <RsvpIcon className={`h-4 w-4 ${rsvp.color} flex-shrink-0`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <p className="text-sm text-[#94a3b8] whitespace-pre-wrap">
                {showFullDescription ? event.description : event.description.split('\n').slice(0, 3).join('\n')}
              </p>
              {event.description.split('\n').length > 3 && (
                <button
                  onClick={() => setShowFullDescription(s => !s)}
                  className="text-xs text-[#d4af37] mt-1 hover:underline"
                >
                  {showFullDescription ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#1a2744]/95 backdrop-blur-sm border-t border-[#2d3a52] p-3 md:p-4 flex items-center justify-between" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(event)}
              className="btn-navy text-xs py-2 px-3 flex items-center gap-1.5"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={() => onDelete(event.google_id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors border border-red-500/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
          {event.html_link && (
            <a
              href={event.html_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#64748b] hover:text-[#d4af37] transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Google Calendar
            </a>
          )}
        </div>
      </div>
    </>
  );
}
