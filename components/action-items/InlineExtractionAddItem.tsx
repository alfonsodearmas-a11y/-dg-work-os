'use client';
import { useState, type FormEvent } from 'react';
import { VERB_CATEGORIES, AGENCIES, type VerbCategory, type Agency } from '@/lib/action-items/constants';

interface UserOption { id: string; name: string; agency: string | null; }

export interface InlineExtractionDefaults {
  extraction_id: string;
  extraction_item_idx: number;
  source_meeting_id: string;
  source_timestamp?: string;
  source_quote?: string;
  agency?: Agency;
  owner_user_id?: string;
  owner_name_raw?: string;
  verb_category?: VerbCategory;
  title?: string;
  description?: string;
  due_date?: string;
  confidence_overall?: number;
}

interface Props {
  defaults: InlineExtractionDefaults;
  ownerOptions: UserOption[];
  onCreated: (taskId: string) => void;
  onCancel?: () => void;
}

export function InlineExtractionAddItem({ defaults, ownerOptions, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    agency: (defaults.agency ?? '') as Agency | '',
    owner_user_id: defaults.owner_user_id ?? '',
    owner_name_raw: defaults.owner_name_raw ?? '',
    verb_category: (defaults.verb_category ?? '') as VerbCategory | '',
    title: defaults.title ?? '',
    description: defaults.description ?? '',
    due_date: defaults.due_date ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(s => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTopErr(null); setIssues({});
    setBusy(true);
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        agency: form.agency || null,
        assignee_id: form.owner_user_id || undefined,
        due_date: form.due_date || undefined,
        source: 'extraction',
        extraction_id: defaults.extraction_id,
        extraction_item_idx: defaults.extraction_item_idx,
        source_meeting_id: defaults.source_meeting_id,
        source_timestamp: defaults.source_timestamp ?? null,
        source_quote: defaults.source_quote ?? null,
        owner_name_raw: form.owner_name_raw,
        verb_category: form.verb_category || null,
        confidence_overall: defaults.confidence_overall ?? 1.0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTopErr(body.error ?? 'Failed');
      const map: Record<string, string> = {};
      for (const it of body.issues ?? []) map[it.field] = it.message;
      setIssues(map);
      return;
    }
    const { task } = await res.json();
    onCreated(task?.id ?? '');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {topErr && <div className="text-xs text-red-500">{topErr}</div>}
      <Field label="Title" error={issues.title}>
        <textarea required maxLength={500} rows={2} value={form.title}
          onChange={e => set('title', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Agency" error={issues.agency}>
          <select required value={form.agency} onChange={e => set('agency', e.target.value as Agency)}
            className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
            <option value="">Select…</option>
            {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Verb category" error={issues.verb_category}>
          <select required value={form.verb_category} onChange={e => set('verb_category', e.target.value as VerbCategory)}
            className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
            <option value="">Select…</option>
            {VERB_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Owner" error={issues.owner_user_id}>
        <select required value={form.owner_user_id} onChange={e => set('owner_user_id', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
          <option value="">Select…</option>
          {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}{o.agency ? ` (${o.agency})` : ''}</option>)}
        </select>
      </Field>
      <Field label="Owner name (as spoken)" error={issues.owner_name_raw}>
        <input required value={form.owner_name_raw} onChange={e => set('owner_name_raw', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm" />
      </Field>
      <Field label="Due date">
        <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm" />
      </Field>
      {defaults.source_quote && (
        <div className="text-xs border-l-2 border-gold-500 pl-2 italic text-navy-300">
          &ldquo;{defaults.source_quote}&rdquo;
          {defaults.source_timestamp && <span className="text-navy-600"> @ {defaults.source_timestamp}</span>}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1 text-xs border border-navy-800 rounded">Cancel</button>}
        <button type="submit" disabled={busy} className="px-3 py-1 text-xs bg-gold-500 text-navy-950 rounded">
          {busy ? 'Saving…' : 'Add to bucket'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-navy-600 mb-0.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-500 mt-0.5">{error}</span>}
    </label>
  );
}
