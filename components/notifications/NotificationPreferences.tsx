'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Clock, Moon } from 'lucide-react';
import type { NotificationPrefs } from '@/lib/notifications';

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
          checked ? 'bg-[#d4af37]' : 'bg-[#2d3a52]'
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

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/notifications/preferences?user_id=dg')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setPrefs(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback((updated: NotificationPrefs) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch('/api/notifications/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: 'dg', ...updated }),
        });
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    }, 500);
  }, []);

  const update = useCallback((key: keyof NotificationPrefs, value: boolean | string | null) => {
    setPrefs(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      save(updated);
      return updated;
    });
  }, [save]);

  if (loading || !prefs) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
        </div>
        <p className="text-[#64748b] text-sm">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
        </div>
        {saving && <span className="text-[10px] text-[#d4af37] uppercase tracking-wider">Saving...</span>}
      </div>

      {/* Meeting Reminders */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Meeting Reminders</h3>
        </div>
        <div className="divide-y divide-[#2d3a52]/30">
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
        <div className="divide-y divide-[#2d3a52]/30">
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
      <div className="mb-6">
        <div className="divide-y divide-[#2d3a52]/30">
          <Toggle
            label="Meeting minutes ready"
            description="Get notified when AI-generated meeting minutes are ready"
            checked={prefs.meeting_minutes_ready}
            onChange={v => update('meeting_minutes_ready', v)}
          />
        </div>
      </div>

      {/* Quiet Mode */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Moon className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Quiet Mode</h3>
        </div>
        <div className="divide-y divide-[#2d3a52]/30">
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
                  <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Start</label>
                  <input
                    type="time"
                    value={prefs.quiet_hours_start || ''}
                    onChange={e => update('quiet_hours_start', e.target.value || null)}
                    className="input-premium text-sm w-full"
                  />
                </div>
                <span className="text-white/30 mt-5">to</span>
                <div className="flex-1">
                  <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">End</label>
                  <input
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
    </div>
  );
}
