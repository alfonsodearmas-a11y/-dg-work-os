'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Settings {
  emails_enabled: boolean;
  bcc_to_dg: boolean;
  updated_at: string;
}

export default function NagSettingsClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch('/api/admin/psip-nag-settings');
    if (r.ok) setSettings(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function update(patch: Partial<Settings>) {
    setSaving(true);
    setError(null);
    const r = await fetch('/api/admin/psip-nag-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ error: 'save failed' }));
      setError(j.error || 'save failed');
    } else {
      setSettings((s) => (s ? { ...s, ...patch } : s));
    }
    setSaving(false);
  }

  if (!settings) return <div className="mx-auto max-w-3xl px-6 py-8 text-navy-600">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-white">PSIP nag email settings</h1>
        <p className="mt-1 text-sm text-navy-600">
          Controls the weekly nag digest and event-triggered emails to PSIP
          focal points. The master toggle ships <strong className="text-white">OFF</strong> — while off, the
          system writes every would-be email to the preview table without
          sending anything. Flip it on only after reviewing preview output.
        </p>
      </header>

      <div className="card-premium space-y-5 p-5">
        <Toggle
          label="Send nag emails"
          description="Master kill-switch. While off, composed emails are written to the preview table but no SMTP attempt is made."
          checked={settings.emails_enabled}
          onChange={(v) => update({ emails_enabled: v })}
          disabled={saving}
        />
        <div className="border-t border-navy-800" />
        <Toggle
          label="BCC DG on all nags"
          description="Adds the DG's email to BCC on every weekly digest and event-triggered message."
          checked={settings.bcc_to_dg}
          onChange={(v) => update({ bcc_to_dg: v })}
          disabled={saving}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-xs text-navy-600">
        Last updated {new Date(settings.updated_at).toLocaleString()}.{' '}
        <Link href="/admin/psip-nag-preview" className="text-gold-400 hover:underline">
          View preview of what would have sent →
        </Link>
      </p>
    </div>
  );
}

function Toggle({ label, description, checked, onChange, disabled }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium text-white">{label}</p>
        <p className="mt-0.5 text-sm text-navy-600">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-gold-500' : 'bg-navy-700'}`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-5' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}
