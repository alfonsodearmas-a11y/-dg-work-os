'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, Loader2, MapPin, FileText } from 'lucide-react';
import { CalendarEvent } from '@/lib/google-calendar';

interface EventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  isNew?: boolean;
  defaultDate?: Date;
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
}

export function EventModal({
  event,
  isOpen,
  isNew,
  defaultDate,
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
    all_day: false
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        start_time: event.start_time || '',
        end_time: event.end_time || '',
        location: event.location || '',
        description: event.description || '',
        all_day: event.all_day || false
      });
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
        all_day: false
      });
    }
  }, [event, defaultDate]);

  if (!isOpen) return null;

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

  const formatDateTimeForInput = (dateStr: string) => {
    if (!dateStr) return '';
    // Handle all-day dates (YYYY-MM-DD format)
    if (dateStr.length === 10) return dateStr;
    // Handle datetime format
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
      <div className="relative w-full max-w-lg rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2d3a52]">
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
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Event Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Meeting with..."
              autoFocus
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
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Start
              </label>
              <input
                type={formData.all_day ? 'date' : 'datetime-local'}
                value={formatDateTimeForInput(formData.start_time)}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                End
              </label>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[#2d3a52]">
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
      </div>
    </div>
  );
}
