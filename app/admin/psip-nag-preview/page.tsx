'use client';

import { useEffect, useState } from 'react';

interface PreviewRow {
  id: string;
  trigger_kind: string;
  agency: string;
  recipient_to: string;
  recipient_bcc: string | null;
  subject: string;
  body: string;
  would_have_sent_at: string;
  actually_sent: boolean;
  sent_at: string | null;
  sent_error: string | null;
}

type Range = '7d' | '30d' | 'all';

export default function PsipNagPreviewPage() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [range, setRange] = useState<Range>('30d');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(r: Range) {
    setLoading(true);
    const res = await fetch(`/api/admin/psip-nag-preview?range=${r}`);
    const j = await res.json();
    setRows(j.rows ?? []);
    setLoading(false);
  }
  useEffect(() => { load(range); }, [range]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">PSIP nag preview</h1>
          <p className="mt-1 text-sm text-navy-600">
            Every weekly-digest and event-triggered email the system has composed,
            regardless of whether it was actually sent. Read-only. To flip real
            sends on or off, go to <a href="/admin/psip-nag-settings" className="text-gold-400 hover:underline">settings</a>.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {(['7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1.5 font-mono uppercase transition ${range === r ? 'bg-gold-500 text-navy-950' : 'bg-navy-900 text-navy-600 hover:text-white'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="text-navy-600">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card-premium p-6 text-center text-navy-600">
          No nag emails composed in the selected range.
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-navy-800 bg-navy-900/50 text-left text-xs uppercase tracking-wider text-navy-600">
              <tr>
                <th className="px-3 py-3">When</th>
                <th className="px-3 py-3">Trigger</th>
                <th className="px-3 py-3">Agency</th>
                <th className="px-3 py-3">TO</th>
                <th className="px-3 py-3">BCC</th>
                <th className="px-3 py-3">Subject</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row.id;
                return (
                  <>
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-navy-800/60 hover:bg-navy-900/40"
                      onClick={() => setExpanded(isOpen ? null : row.id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-navy-600">
                        {new Date(row.would_have_sent_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2"><TriggerPill kind={row.trigger_kind} /></td>
                      <td className="px-3 py-2 font-mono text-xs text-white">{row.agency}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{row.recipient_to}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{row.recipient_bcc ?? '—'}</td>
                      <td className="px-3 py-2 text-sm text-white">{row.subject}</td>
                      <td className="px-3 py-2"><StatusPill row={row} /></td>
                    </tr>
                    {isOpen && (
                      <tr key={`${row.id}-body`} className="border-b border-navy-800/60 bg-navy-950/60">
                        <td colSpan={7} className="px-6 py-4">
                          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300">{row.body}</pre>
                          {row.sent_error && (
                            <p className="mt-3 text-xs text-red-400">SMTP error: {row.sent_error}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TriggerPill({ kind }: { kind: string }) {
  const color =
    kind === 'escalation' ? '#dc2626' :
    kind === 'event_new_critical' ? '#e8835a' :
    '#4a82f5';
  return (
    <span
      className="rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold uppercase"
      style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
    >
      {kind}
    </span>
  );
}

function StatusPill({ row }: { row: PreviewRow }) {
  if (row.actually_sent && !row.sent_error) {
    return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">sent</span>;
  }
  if (row.actually_sent && row.sent_error) {
    return <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">failed</span>;
  }
  return <span className="rounded bg-navy-800 px-2 py-0.5 text-xs text-navy-600">preview-only</span>;
}
