'use client';

import { useEffect, useState } from 'react';

interface Row {
  agency: string;
  focal_point_name: string;
  focal_point_email: string;
  agency_head_name: string | null;
  agency_head_email: string | null;
  updated_at: string;
}

type Field = 'focal_point_name' | 'focal_point_email' | 'agency_head_name' | 'agency_head_email';

export default function FocalPointsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/psip-focal-points');
    const j = await r.json();
    setRows(j.rows ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save(agency: string, field: Field, value: string) {
    const key = `${agency}:${field}`;
    setSavingKey(key);
    setErrors((e) => ({ ...e, [key]: '' }));
    const res = await fetch('/api/admin/psip-focal-points', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency, [field]: value }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'save failed' }));
      setErrors((e) => ({ ...e, [key]: j.error || 'save failed' }));
    } else {
      setRows((prev) => prev.map((r) => (r.agency === agency ? { ...r, [field]: value, updated_at: new Date().toISOString() } : r)));
    }
    setSavingKey(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">PSIP focal points</h1>
        <p className="mt-1 text-sm text-navy-600">
          Who to email when an agency has tenders missing required PSIP dates.
          Empty email = no nags sent. Agency head is added to the email only
          when a tender has been nagged 3+ consecutive weeks.
        </p>
      </div>

      {loading ? (
        <p className="text-navy-600">Loading…</p>
      ) : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-navy-800 bg-navy-900/50 text-left text-xs uppercase tracking-wider text-navy-600">
              <tr>
                <th className="px-4 py-3">Agency</th>
                <th className="px-4 py-3">Focal point name</th>
                <th className="px-4 py-3">Focal point email</th>
                <th className="px-4 py-3">Head name</th>
                <th className="px-4 py-3">Head email</th>
                <th className="px-4 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.agency} className="border-b border-navy-800/60 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-white">{row.agency}</td>
                  {(['focal_point_name', 'focal_point_email', 'agency_head_name', 'agency_head_email'] as const).map((field) => {
                    const key = `${row.agency}:${field}`;
                    const val = (row[field] ?? '') as string;
                    const err = errors[key];
                    return (
                      <td key={field} className="px-4 py-3">
                        <EditableCell
                          initialValue={val}
                          onSave={(v) => save(row.agency, field, v)}
                          saving={savingKey === key}
                          placeholder={field.endsWith('_email') ? 'name@mpua.gov.gy' : field.includes('name') ? 'Full name' : ''}
                        />
                        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 font-mono text-xs text-navy-600">
                    {new Date(row.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EditableCell({ initialValue, onSave, saving, placeholder }: {
  initialValue: string;
  onSave: (v: string) => void | Promise<void>;
  saving: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  const dirty = value.trim() !== (initialValue ?? '').trim();

  return (
    <div className="flex items-center gap-2">
      <input
        className="w-full rounded border border-navy-800 bg-navy-950/60 px-2 py-1 text-sm text-white placeholder:text-navy-700 focus:border-gold-500 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (dirty) onSave(value.trim()); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setValue(initialValue);
        }}
        disabled={saving}
      />
      {saving && <span className="text-xs text-navy-600">…</span>}
    </div>
  );
}
