'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Clock, Moon, Mail, AtSign, Reply, UserPlus, AlertTriangle, CalendarClock, ArrowRightLeft, CheckCircle2, ListChecks, Check } from 'lucide-react';
import type { NotificationPrefs, EventPreferencesMap, EventEmailPref, DigestFrequency } from '@/lib/notifications';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-gold-500' : 'bg-navy-800'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function MiniToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-gold-500' : 'bg-navy-800'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function EmailSelect({ value, onChange }: { value: EventEmailPref; onChange: (v: EventEmailPref) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as EventEmailPref)}
      className="input-premium text-xs py-1 px-2 w-24 rounded-md appearance-none cursor-pointer"
    >
      <option value="instant">Instant</option>
      <option value="digest">Digest</option>
      <option value="off">Off</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Event type metadata
// ---------------------------------------------------------------------------

type EventTypeKey = keyof EventPreferencesMap;

interface EventTypeMeta {
  key: EventTypeKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const EVENT_TYPES: EventTypeMeta[] = [
  { key: 'comment_mention', label: '@Mentions', description: 'When someone tags you in a comment', icon: AtSign },
  { key: 'comment_reply', label: 'Comment Replies', description: 'Replies to your comments', icon: Reply },
  { key: 'task_assigned', label: 'Task Assigned', description: 'When a task is assigned to you', icon: UserPlus },
  { key: 'task_blocked', label: 'Task Blocked', description: 'When a task you\'re involved in gets blocked', icon: AlertTriangle },
  { key: 'task_due_soon', label: 'Task Due Soon', description: 'Reminders for upcoming deadlines', icon: CalendarClock },
  { key: 'task_status_change', label: 'Status Changes', description: 'When task status changes', icon: ArrowRightLeft },
  { key: 'task_completed', label: 'Task Completed', description: 'When a task is marked done', icon: CheckCircle2 },
  { key: 'subtask_completed', label: 'Subtask Completed', description: 'When a subtask is finished', icon: ListChecks },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => setPrefs(data))
      .catch(() => setError('Could not load notification preferences'))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback((updated: NotificationPrefs) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSaved(false);
      try {
        const res = await fetch('/api/notifications/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        if (!res.ok) throw new Error('Save failed');
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      } catch {
        setError('Failed to save preferences');
        setTimeout(() => setError(null), 3000);
      } finally {
        setSaving(false);
      }
    }, 500);
  }, []);

  const update = useCallback((key: keyof NotificationPrefs, value: boolean | string | null | EventPreferencesMap) => {
    setPrefs(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      save(updated);
      return updated;
    });
  }, [save]);

  const updateEventPref = useCallback((eventKey: EventTypeKey, field: 'in_app' | 'email', value: boolean | EventEmailPref) => {
    setPrefs(prev => {
      if (!prev) return prev;
      const newEventPrefs = {
        ...prev.event_preferences,
        [eventKey]: {
          ...prev.event_preferences[eventKey],
          [field]: value,
        },
      };
      const updated = { ...prev, event_preferences: newEventPrefs };
      save(updated);
      return updated;
    });
  }, [save]);

  if (loading || !prefs) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-gold-500" />
          <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
        </div>
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <p className="text-navy-600 text-sm">Loading preferences...</p>
        )}
      </div>
    );
  }

  return (
    <div className="card-premium p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gold-500" />
          <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gold-500 uppercase tracking-wider">Saving...</span>}
          {saved && !saving && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 uppercase tracking-wider">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          {error && !saving && (
            <span className="text-xs text-red-400 uppercase tracking-wider">{error}</span>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 1: Event Notifications                                   */}
      {/* ================================================================ */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Event Notifications</h3>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-2 mb-1">
          <span className="text-xs text-white/30 uppercase tracking-wider">Event</span>
          <span className="text-xs text-white/30 uppercase tracking-wider text-center w-16">In-App</span>
          <span className="text-xs text-white/30 uppercase tracking-wider text-center w-24">Email</span>
        </div>

        {/* Rows */}
        <div className="rounded-lg border border-navy-800/50 overflow-hidden">
          {EVENT_TYPES.map((evt, idx) => {
            const pref = prefs.event_preferences[evt.key];
            const Icon = evt.icon;
            return (
              <div
                key={evt.key}
                className={`grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-3 bg-navy-900/60 ${
                  idx !== EVENT_TYPES.length - 1 ? 'border-b border-navy-800/30' : ''
                }`}
              >
                {/* Event name + description */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 text-white/30 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{evt.label}</p>
                    <p className="text-xs text-white/40 mt-0.5 truncate">{evt.description}</p>
                  </div>
                </div>

                {/* In-app toggle */}
                <div className="flex justify-center w-16">
                  <MiniToggle
                    checked={pref.in_app}
                    onChange={v => updateEventPref(evt.key, 'in_app', v)}
                  />
                </div>

                {/* Email dropdown */}
                <div className="flex justify-center w-24">
                  <EmailSelect
                    value={pref.email}
                    onChange={v => updateEventPref(evt.key, 'email', v)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 2: Digest Settings                                       */}
      {/* ================================================================ */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Email Digest</h3>
        </div>

        <div className="rounded-lg border border-navy-800/50 bg-navy-900/60 p-4 space-y-4">
          {/* Frequency */}
          <div>
            <label className="text-xs text-white/30 uppercase tracking-wider block mb-2">Frequency</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'off'] as DigestFrequency[]).map(freq => (
                <button
                  key={freq}
                  onClick={() => update('digest_frequency', freq)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    prefs.digest_frequency === freq
                      ? 'bg-gold-500 text-navy-950'
                      : 'bg-navy-800 text-white/60 hover:bg-navy-700 hover:text-white'
                  }`}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Time — only relevant when digest is not "off" */}
          {prefs.digest_frequency !== 'off' && (
            <div>
              <label htmlFor="digest-time" className="text-xs text-white/30 uppercase tracking-wider block mb-2">
                Preferred delivery time
              </label>
              <input
                id="digest-time"
                type="time"
                value={prefs.digest_time || '07:00'}
                onChange={e => update('digest_time', e.target.value || '07:00')}
                className="input-premium text-sm w-36"
              />
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 3: Quiet Hours                                           */}
      {/* ================================================================ */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Moon className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Quiet Mode</h3>
        </div>
        <div className="divide-y divide-navy-800/30">
          <Toggle
            label="Do not disturb"
            description="Suppress all toast notifications"
            checked={prefs.do_not_disturb}
            onChange={v => update('do_not_disturb', v)}
          />
          {!prefs.do_not_disturb && (
            <div className="py-3">
              <p className="text-sm text-white mb-2">Quiet hours</p>
              <p className="text-xs text-white/40 mb-3">Suppress toasts during these hours</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="quiet-hours-start" className="text-xs text-white/30 uppercase tracking-wider block mb-1">Start</label>
                  <input
                    id="quiet-hours-start"
                    type="time"
                    value={prefs.quiet_hours_start || ''}
                    onChange={e => update('quiet_hours_start', e.target.value || null)}
                    className="input-premium text-sm w-full"
                  />
                </div>
                <span className="text-white/30 mt-5">to</span>
                <div className="flex-1">
                  <label htmlFor="quiet-hours-end" className="text-xs text-white/30 uppercase tracking-wider block mb-1">End</label>
                  <input
                    id="quiet-hours-end"
                    type="time"
                    value={prefs.quiet_hours_end || ''}
                    onChange={e => update('quiet_hours_end', e.target.value || null)}
                    className="input-premium text-sm w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Section 4: Legacy toggles (backward compat)                      */}
      {/* ================================================================ */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Meeting Reminders</h3>
        </div>
        <div className="divide-y divide-navy-800/30">
          <Toggle
            label="24 hours before"
            description="Get reminded about meetings the day before"
            checked={prefs.meeting_reminder_24h}
            onChange={v => update('meeting_reminder_24h', v)}
          />
          <Toggle
            label="1 hour before"
            description="Get reminded 1 hour before meetings"
            checked={prefs.meeting_reminder_1h}
            onChange={v => update('meeting_reminder_1h', v)}
          />
          <Toggle
            label="15 minutes before"
            description="Get reminded just before meetings start"
            checked={prefs.meeting_reminder_15m}
            onChange={v => update('meeting_reminder_15m', v)}
          />
        </div>
      </div>

      {/* Task Alerts */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Task Alerts</h3>
        </div>
        <div className="divide-y divide-navy-800/30">
          <Toggle
            label="Due date reminders"
            description="Get alerts when tasks are due tomorrow or today"
            checked={prefs.task_due_reminders}
            onChange={v => update('task_due_reminders', v)}
          />
          <Toggle
            label="Overdue alerts"
            description="Get alerts for overdue tasks"
            checked={prefs.task_overdue_alerts}
            onChange={v => update('task_overdue_alerts', v)}
          />
        </div>
      </div>

      {/* Other */}
      <div>
        <div className="divide-y divide-navy-800/30">
          <Toggle
            label="Meeting minutes ready"
            description="Get notified when AI-generated meeting minutes are ready"
            checked={prefs.meeting_minutes_ready}
            onChange={v => update('meeting_minutes_ready', v)}
          />
        </div>
      </div>
    </div>
  );
}
