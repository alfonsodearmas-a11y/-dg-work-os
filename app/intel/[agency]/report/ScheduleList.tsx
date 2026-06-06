'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, Pencil, Trash2 } from 'lucide-react';
import {
  GenerateReportModal,
  type ReportSchedulePrefill,
} from '@/components/intel/GenerateReportModal';

export type Schedule = {
  id: string;
  agency: string;
  recipients: string[];
  cover_message: string | null;
  frequency: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  timezone: string;
  template: 'plain' | 'editorial';
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_error: string | null;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describe(s: Schedule): string {
  const hh = String(s.send_hour).padStart(2, '0');
  if (s.frequency === 'weekly' || s.frequency === 'fortnightly') {
    const dow = s.day_of_week == null ? '' : DAY_LABELS[s.day_of_week];
    const word = s.frequency === 'weekly' ? 'Every' : 'Every other';
    return `${word} ${dow} at ${hh}:00 local`;
  }
  return `Monthly on day ${s.day_of_month} at ${hh}:00 local`;
}

function fmtLocal(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function toPrefill(s: Schedule): ReportSchedulePrefill {
  return {
    id: s.id,
    recipients: s.recipients,
    cover_message: s.cover_message,
    frequency: s.frequency,
    day_of_week: s.day_of_week,
    day_of_month: s.day_of_month,
    send_hour: s.send_hour,
    template: s.template,
  };
}

type Props = { agency: string; agencyDisplay?: string };

export function ScheduleList({ agency, agencyDisplay }: Props) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Schedule | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(`/api/intel/${agency}/schedules`, { cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as { schedules: Schedule[] };
        setItems(j.schedules ?? []);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [agency]);

  async function toggle(s: Schedule) {
    await fetch(`/api/intel/${agency}/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    await refresh();
  }

  async function remove(s: Schedule) {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/intel/${agency}/schedules/${s.id}`, { method: 'DELETE' });
    await refresh();
  }

  if (loading) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--navy-800)] bg-[var(--navy-900)]/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Scheduled Reports
        </h3>
        <span className="text-xs text-[var(--navy-600)]">
          {items.length === 0
            ? 'None'
            : `${items.length} schedule${items.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--navy-600)]">
          Open the Generate Report modal on the agency page and switch to Schedule to set
          up a recurring send.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--navy-800)]">
          {items.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white">
                  {describe(s)}
                  {!s.active && (
                    <span className="ml-2 text-xs uppercase tracking-wider text-amber-400">
                      Paused
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--navy-600)] mt-1 truncate">
                  To: {s.recipients.join(', ')}
                </div>
                <div className="text-xs text-[var(--navy-600)] mt-0.5">
                  Next: {fmtLocal(s.next_run_at)}
                  {s.last_run_at ? `  ·  Last: ${fmtLocal(s.last_run_at)}` : ''}
                </div>
                {s.last_error && (
                  <div className="text-xs text-red-400 mt-1 truncate">
                    Last error: {s.last_error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-[var(--navy-800)] text-slate-300 hover:text-white"
                >
                  {s.active ? (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" /> Resume
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-[var(--navy-800)] text-slate-300 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-[var(--navy-800)] text-slate-300 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <GenerateReportModal
          agency={agency}
          agencyDisplay={agencyDisplay ?? agency.toUpperCase()}
          initialMode="schedule"
          schedulePrefill={toPrefill(editing)}
          onClose={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
