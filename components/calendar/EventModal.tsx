'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, Loader2, MapPin, FileText, Sparkles, Video, Users, Bell, Repeat } from 'lucide-react';
import { CalendarEvent } from '@/lib/calendar-types';

interface EventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  isNew?: boolean;
  defaultDate?: Date;
  enableQuickCreate?: boolean;
  onClose: () => void;
  onSave: (data: EventFormData) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
}

export interface EventFormData {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  all_day: boolean;
  attendees?: string[];
  add_google_meet?: boolean;
  reminder_minutes?: number;
  recurrence?: string;
}

export function EventModal({
  event,
  isOpen,
  isNew,
  defaultDate,
  enableQuickCreate,
  onClose,
  onSave,
  onDelete
}: EventModalProps) {
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    start_time: '',
    end_time: '',
    location: '',
    description: '',
    all_day: false,
    attendees: [],
    add_google_meet: false,
    reminder_minutes: 15,
    recurrence: 'none',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Quick create state
  const [quickInput, setQuickInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(!!enableQuickCreate && !!isNew);

  // Attendee input
  const [attendeeInput, setAttendeeInput] = useState('');
  const [contactSuggestions, setContactSuggestions] = useState<Array<{ email: string; display_name: string | null }>>([]);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        start_time: event.start_time || '',
        end_time: event.end_time || '',
        location: event.location || '',
        description: event.description || '',
        all_day: event.all_day || false,
        attendees: event.attendees?.map(a => a.email) || [],
        add_google_meet: !!event.conference_data,
        reminder_minutes: 15,
        recurrence: 'none',
      });
      setShowQuickCreate(false);
    } else if (defaultDate) {
      const dateStr = defaultDate.toISOString().split('T')[0];
      const now = new Date();
      const startHour = now.getHours();
      const startTime = `${dateStr}T${String(startHour).padStart(2, '0')}:00`;
      const endTime = `${dateStr}T${String(startHour + 1).padStart(2, '0')}:00`;
      setFormData({
        title: '',
        start_time: startTime,
        end_time: endTime,
        location: '',
        description: '',
        all_day: false,
        attendees: [],
        add_google_meet: false,
        reminder_minutes: 15,
        recurrence: 'none',
      });
      setShowQuickCreate(!!enableQuickCreate && !!isNew);
    }
  }, [event, defaultDate, enableQuickCreate, isNew]);

  // Debounced contact search
  const searchContacts = useCallback(async (q: string) => {
    if (q.length < 2) { setContactSuggestions([]); return; }
    try {
      const res = await fetch(`/api/calendar/contacts?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setContactSuggestions(data.slice(0, 5));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (attendeeInput.length >= 2) searchContacts(attendeeInput);
      else setContactSuggestions([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [attendeeInput, searchContacts]);

  if (!isOpen) return null;

  const handleQuickParse = async () => {
    if (!quickInput.trim()) return;
    setParsing(true);
    try {
      const res = await fetch('/api/calendar/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: quickInput.trim() }),
      });
      if (!res.ok) throw new Error('Parse failed');
      const parsed = await res.json();
      setFormData({
        title: parsed.title || '',
        start_time: parsed.start_time || '',
        end_time: parsed.end_time || '',
        location: parsed.location || '',
        description: parsed.description || '',
        all_day: parsed.all_day || false,
        attendees: parsed.attendees || [],
        add_google_meet: parsed.add_google_meet || false,
        reminder_minutes: 15,
        recurrence: 'none',
      });
      setShowQuickCreate(false);
    } catch {
      // Fall back to just setting the title
      setFormData(prev => ({ ...prev, title: quickInput }));
      setShowQuickCreate(false);
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
    if (!confirm('Delete this event? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete(event.google_id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const addAttendee = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    if (formData.attendees?.includes(trimmed)) return;
    setFormData(prev => ({
      ...prev,
      attendees: [...(prev.attendees || []), trimmed],
    }));
    setAttendeeInput('');
    setContactSuggestions([]);
  };

  const removeAttendee = (email: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: (prev.attendees || []).filter(a => a !== email),
    }));
  };

  const formatDateTimeForInput = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.length === 10) return dateStr;
    return dateStr.slice(0, 16);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-[#2d3a52] bg-[#1a2744]/95 backdrop-blur-sm z-10">
          <h2 className="text-lg font-semibold text-white">
            {isNew ? 'New Event' : 'Edit Event'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Quick Create */}
          {showQuickCreate && (
            <div className="p-4 rounded-xl bg-[#0a1628]/50 border border-[#2d3a52] space-y-3">
              <div className="flex items-center gap-2 text-sm text-[#d4af37]">
                <Sparkles className="h-4 w-4" />
                Quick Create
              </div>
              <input
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickParse()}
                placeholder="e.g. Meeting with GPL team tomorrow at 2pm about load shedding"
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleQuickParse}
                  disabled={parsing || !quickInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50"
                >
                  {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Parse with AI
                </button>
                <button
                  onClick={() => setShowQuickCreate(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
                >
                  Manual entry
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          {!showQuickCreate && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  Event Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Meeting with..."
                  autoFocus={!enableQuickCreate}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors"
                />
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, all_day: !formData.all_day })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formData.all_day ? 'bg-[#d4af37]' : 'bg-[#2d3a52]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.all_day ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-[#94a3b8]">All-day event</span>
              </div>

              {/* Date/Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Start</label>
                  <input
                    type={formData.all_day ? 'date' : 'datetime-local'}
                    value={formatDateTimeForInput(formData.start_time)}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">End</label>
                  <input
                    type={formData.all_day ? 'date' : 'datetime-local'}
                    value={formatDateTimeForInput(formData.end_time)}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  <MapPin className="inline h-3.5 w-3.5 mr-1" />
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Office, Zoom link, etc."
                  className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors"
                />
              </div>

              {/* Google Meet Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, add_google_meet: !formData.add_google_meet })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formData.add_google_meet ? 'bg-[#d4af37]' : 'bg-[#2d3a52]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.add_google_meet ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-[#94a3b8] flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Add Google Meet
                </span>
              </div>

              {/* Attendees */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  <Users className="inline h-3.5 w-3.5 mr-1" />
                  Attendees
                </label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={attendeeInput}
                      onChange={(e) => setAttendeeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addAttendee(attendeeInput); }
                      }}
                      placeholder="email@example.com"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors text-sm"
                    />
                    <button
                      onClick={() => addAttendee(attendeeInput)}
                      className="px-3 py-2 rounded-lg bg-[#2d3a52] text-[#94a3b8] hover:text-white text-sm transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {/* Contact suggestions dropdown */}
                  {contactSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-12 mt-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl z-20 overflow-hidden">
                      {contactSuggestions.map(c => (
                        <button
                          key={c.email}
                          onClick={() => addAttendee(c.email)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#2d3a52] transition-colors"
                        >
                          <p className="text-white text-xs">{c.display_name || c.email}</p>
                          {c.display_name && <p className="text-[#64748b] text-[10px]">{c.email}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Attendee pills */}
                {formData.attendees && formData.attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.attendees.map(email => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#2d3a52] text-xs text-[#94a3b8]"
                      >
                        {email}
                        <button
                          onClick={() => removeAttendee(email)}
                          className="text-[#64748b] hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Reminder + Recurrence row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                    <Bell className="inline h-3.5 w-3.5 mr-1" />
                    Reminder
                  </label>
                  <select
                    value={formData.reminder_minutes}
                    onChange={(e) => setFormData({ ...formData, reminder_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors text-sm"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                    <Repeat className="inline h-3.5 w-3.5 mr-1" />
                    Recurrence
                  </label>
                  <select
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors text-sm"
                  >
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                  <FileText className="inline h-3.5 w-3.5 mr-1" />
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add details..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!showQuickCreate && (
          <div className="sticky bottom-0 flex items-center justify-between p-4 border-t border-[#2d3a52] bg-[#1a2744]/95 backdrop-blur-sm">
            {!isNew && onDelete ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.title.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? 'Create Event' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
