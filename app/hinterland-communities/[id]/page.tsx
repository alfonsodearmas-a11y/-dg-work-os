'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, ArrowLeft, RefreshCw, Droplets, Zap, PlaneLanding,
  X, Loader2, Edit3, ExternalLink, Link2, Unlink, MapPin,
} from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import {
  STATUS_CONFIG, WATER_STATUSES, WATER_SOURCE_STATUS_CONFIG, waterSourceTypeLabel,
} from '@/lib/hinterland-types';
import type {
  CommunityDetail, WaterStatus, WaterStatusValue,
} from '@/lib/hinterland-types';
import { STATUS_CONFIG as AIRSTRIP_STATUS_CONFIG } from '@/lib/airstrip-types';
import type { AirstripOption } from '@/lib/hinterland-types';
import { StatusBadge, CoverageBar } from '@/components/hinterland/ui';

type TabId = 'water' | 'electricity' | 'airstrips';

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputClass = 'w-full px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors';

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-navy-950 border border-navy-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function DetailBlock({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <span className="text-xs text-navy-600 uppercase tracking-wide block mb-1">{label}</span>
      <p className="text-sm text-slate-300 whitespace-pre-line">{text || <span className="text-navy-600">Not recorded</span>}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function CommunityProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('water');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hinterland/communities/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Community not found' : 'Failed to fetch');
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 rounded bg-navy-900/50 animate-pulse" />
        <div className="h-28 rounded-xl bg-navy-900/50 animate-pulse" />
        <div className="h-64 rounded-xl bg-navy-900/50 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/hinterland-communities" className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Communities
        </Link>
        <div className="card-premium p-8 text-center">
          <p className="text-red-400 mb-3">{error || 'Not found'}</p>
          <button onClick={fetchData} className="btn-navy px-4 py-2 text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const { community: c, water_status: ws, water_sources, water_status_log, airstrip } = data;
  const waterStatus = (ws?.status ?? 'unknown') as WaterStatusValue;

  const tabs: Tab[] = [
    { id: 'water', label: 'Water', icon: Droplets },
    { id: 'electricity', label: 'Electricity', icon: Zap },
    { id: 'airstrips', label: 'Airstrips', icon: PlaneLanding, badge: airstrip ? 1 : undefined },
  ];

  return (
    <div className="space-y-6">
      <Link href="/hinterland-communities" className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Communities
      </Link>

      {/* Header */}
      <div className="card-premium p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="h-5 w-5 text-gold-500" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{c.name}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge value={waterStatus} config={STATUS_CONFIG} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-800 text-xs font-medium text-white">Region {c.region}</span>
                {c.sub_district && <span className="text-xs text-slate-400">{c.sub_district}</span>}
                {c.population != null && (
                  <span className="text-xs text-navy-600">pop. <span className="text-slate-300 font-mono tabular-nums">{c.population.toLocaleString()}</span></span>
                )}
              </div>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors shrink-0" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={t => setActiveTab(t as TabId)}>
        <div className="mt-6">
          {activeTab === 'water' && (
            <WaterTab
              communityId={id}
              waterStatus={ws}
              statusValue={waterStatus}
              region={c.region}
              sources={water_sources}
              log={water_status_log}
              onSaved={fetchData}
            />
          )}
          {activeTab === 'electricity' && <ElectricityTab />}
          {activeTab === 'airstrips' && (
            <AirstripsTab communityId={id} airstrip={airstrip} onSaved={fetchData} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: WATER
// ════════════════════════════════════════════════════════════════════════════

function WaterTab({ communityId, waterStatus, statusValue, region, sources, log, onSaved }: {
  communityId: string;
  waterStatus: WaterStatus | null;
  statusValue: WaterStatusValue;
  region: number;
  sources: CommunityDetail['water_sources'];
  log: CommunityDetail['water_status_log'];
  onSaved: () => void;
}) {
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left — water record + sources */}
      <div className="lg:col-span-2 space-y-6">
        {/* Status + coverage */}
        <div className="card-premium p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gold-500 uppercase tracking-wide">Water status</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setStatusModalOpen(true)} className="btn-navy px-3 py-1.5 text-xs">Change status</button>
              <button onClick={() => setEditing(v => !v)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
                <Edit3 className="h-3.5 w-3.5" /> {editing ? 'Cancel' : 'Edit details'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap mb-4">
            <StatusBadge value={statusValue} config={STATUS_CONFIG} />
            <div className="min-w-[160px]">
              <span className="text-[10px] text-navy-600 uppercase tracking-wide block mb-1">Coverage</span>
              <CoverageBar value={waterStatus?.coverage_percent ?? null} />
            </div>
          </div>

          {editing ? (
            <WaterEditForm
              communityId={communityId}
              waterStatus={waterStatus}
              onDone={() => { setEditing(false); onSaved(); }}
            />
          ) : (
            <div className="space-y-4">
              <DetailBlock label="Existing infrastructure" text={waterStatus?.existing_infrastructure ?? null} />
              <DetailBlock label="Proposed solutions" text={waterStatus?.proposed_solutions ?? null} />
              {waterStatus?.action && <DetailBlock label="Action" text={waterStatus.action} />}
              {waterStatus?.schools_access && <DetailBlock label="Schools access" text={waterStatus.schools_access} />}
              {waterStatus?.remarks && <DetailBlock label="Remarks" text={waterStatus.remarks} />}
            </div>
          )}
        </div>

        {/* Sources */}
        <div className="card-premium p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gold-500 uppercase tracking-wide">Water sources</h3>
            <span className="text-xs text-navy-600">{sources.length} recorded</span>
          </div>
          {sources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-navy-800 py-8 px-4 text-center">
              <Droplets className="h-6 w-6 text-navy-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No sources recorded yet</p>
              <p className="text-xs text-navy-600 mt-1 max-w-md mx-auto">
                Source-level detail (wells, pump stations, production, pressure) is ready for entry as GWI supplies it.
                {region !== 9 && ' Only Region 9 carries source detail in the current register.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-navy-800">
              <table className="table-premium min-w-full">
                <thead>
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs">Source</th>
                    <th className="px-3 py-2.5 text-left text-xs">Type</th>
                    <th className="px-3 py-2.5 text-left text-xs">Status</th>
                    <th className="px-3 py-2.5 text-right text-xs">Production</th>
                    <th className="px-3 py-2.5 text-right text-xs">Pressure</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map(s => (
                    <tr key={s.id} className="border-t border-navy-800/40 align-top">
                      <td className="px-3 py-2.5 text-sm text-white">
                        {s.source_name}
                        {s.comments && <p className="text-[11px] text-navy-600 mt-0.5">{s.comments}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{waterSourceTypeLabel(s.source_type)}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={s.source_status ?? null} config={WATER_SOURCE_STATUS_CONFIG} /></td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums text-slate-300">
                        {s.production_m3hr != null ? `${s.production_m3hr} m³/hr` : (s.production_raw || '—')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono tabular-nums text-slate-300">
                        {s.pressure_psi != null ? `${s.pressure_psi} PSI` : (s.pressure_raw || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right — status history */}
      <div className="card-premium p-5 h-fit">
        <h3 className="text-sm font-semibold text-gold-500 uppercase tracking-wide mb-4">Status history</h3>
        {log.length === 0 ? (
          <p className="text-sm text-navy-600">No status changes recorded.</p>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-navy-800" />
            <div className="space-y-5">
              {log.map(entry => (
                <div key={entry.id} className="relative">
                  <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full border-2 border-navy-800 bg-gold-500" />
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[11px] text-navy-600">{formatDate(entry.changed_at)}</span>
                    {entry.changed_by_name && <span className="text-[11px] text-slate-400">by {entry.changed_by_name}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {entry.previous_status && <StatusBadge value={entry.previous_status} config={STATUS_CONFIG} />}
                    {entry.previous_status && <span className="text-navy-600 text-xs">→</span>}
                    <StatusBadge value={entry.new_status} config={STATUS_CONFIG} />
                  </div>
                  {entry.reason && <p className="text-xs text-slate-400 mt-1.5">{entry.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ChangeWaterStatusModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        communityId={communityId}
        currentStatus={statusValue}
        onSaved={() => { setStatusModalOpen(false); onSaved(); }}
      />
    </div>
  );
}

function WaterEditForm({ communityId, waterStatus, onDone }: {
  communityId: string; waterStatus: WaterStatus | null; onDone: () => void;
}) {
  const [form, setForm] = useState({
    water_coverage_percent: waterStatus?.coverage_percent != null ? String(waterStatus.coverage_percent) : '',
    water_existing_infrastructure: waterStatus?.existing_infrastructure ?? '',
    water_proposed_solutions: waterStatus?.proposed_solutions ?? '',
    water_action: waterStatus?.action ?? '',
    water_schools_access: waterStatus?.schools_access ?? '',
    water_remarks: waterStatus?.remarks ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function up(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    setErr(null);
    const cov = form.water_coverage_percent.trim();
    const payload: Record<string, unknown> = {
      water_coverage_percent: cov === '' ? null : Number(cov),
      water_existing_infrastructure: form.water_existing_infrastructure.trim() || null,
      water_proposed_solutions: form.water_proposed_solutions.trim() || null,
      water_action: form.water_action.trim() || null,
      water_schools_access: form.water_schools_access.trim() || null,
      water_remarks: form.water_remarks.trim() || null,
    };
    try {
      const res = await fetch(`/api/hinterland/communities/${communityId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || 'Save failed'); return; }
      onDone();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  const fieldLabel = 'text-xs font-medium text-navy-600 uppercase tracking-wide';

  return (
    <div className="space-y-4">
      {err && <p className="text-xs text-red-400">{err}</p>}
      <label className="block space-y-1.5">
        <span className={fieldLabel}>Coverage percent (0–100)</span>
        <input type="number" min={0} max={100} value={form.water_coverage_percent} onChange={e => up('water_coverage_percent', e.target.value)} className={inputClass} placeholder="e.g. 85" />
      </label>
      {([
        ['water_existing_infrastructure', 'Existing infrastructure'],
        ['water_proposed_solutions', 'Proposed solutions'],
        ['water_action', 'Action'],
        ['water_schools_access', 'Schools access'],
        ['water_remarks', 'Remarks'],
      ] as const).map(([key, label]) => (
        <label key={key} className="block space-y-1.5">
          <span className={fieldLabel}>{label}</span>
          <textarea value={form[key]} onChange={e => up(key, e.target.value)} className={inputClass} rows={2} />
        </label>
      ))}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="btn-navy px-4 py-2 text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

function ChangeWaterStatusModal({ open, onClose, communityId, currentStatus, onSaved }: {
  open: boolean; onClose: () => void; communityId: string; currentStatus: WaterStatusValue; onSaved: () => void;
}) {
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNewStatus(''); setReason(''); } }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hinterland/communities/${communityId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ water_status: newStatus, water_status_reason: reason.trim() || undefined }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed'); return; }
      onSaved();
    } catch { alert('Failed to change status'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change water status">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-600">Current:</span>
          <StatusBadge value={currentStatus} config={STATUS_CONFIG} />
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">New status</span>
          <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputClass} required>
            <option value="">Select status…</option>
            {WATER_STATUSES.filter(s => s !== currentStatus).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">Reason (optional)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} className={inputClass} rows={3} placeholder="Why is the status changing?" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !newStatus} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Change status
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: ELECTRICITY (phase 2 — empty ready state)
// ════════════════════════════════════════════════════════════════════════════

function ElectricityTab() {
  return (
    <div className="card-premium p-8 text-center max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-xl bg-navy-800 flex items-center justify-center mx-auto mb-4">
        <Zap className="h-6 w-6 text-navy-600" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">Electricity — phase 2</h3>
      <p className="text-sm text-navy-600 max-w-md mx-auto">
        The electricity tracker is built and ready with the same shape as Water (status, sources, history).
        No data has been loaded yet. Records will appear here once the electrification register is imported.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: AIRSTRIPS (read from the airstrips module — system of record)
// ════════════════════════════════════════════════════════════════════════════

function AirstripsTab({ communityId, airstrip, onSaved }: {
  communityId: string; airstrip: CommunityDetail['airstrip']; onSaved: () => void;
}) {
  const [options, setOptions] = useState<AirstripOption[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(async () => {
    if (options) return;
    try {
      const res = await fetch('/api/hinterland/airstrips/options');
      if (res.ok) { const j = await res.json(); setOptions(j.airstrips ?? []); }
    } catch { setOptions([]); }
  }, [options]);

  async function setLink(airstripId: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/hinterland/communities/${communityId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nearest_airstrip_id: airstripId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed'); return; }
      setSelecting(false);
      onSaved();
    } catch { alert('Failed to update airstrip link'); }
    finally { setSaving(false); }
  }

  // Linked airstrip — read-only snapshot.
  if (airstrip && !selecting) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="card-premium p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gold-500 uppercase tracking-wide">Nearest / serving airstrip</span>
            </div>
            <span className="text-[10px] text-navy-600">read-only from the airstrips module</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
              <PlaneLanding className="h-5 w-5 text-gold-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{airstrip.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge value={airstrip.status} config={AIRSTRIP_STATUS_CONFIG} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-800 text-xs font-medium text-white">Region {airstrip.region}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-navy-600 uppercase tracking-wide">Surface condition</span>
              <span className="text-sm text-slate-300">{airstrip.surface_condition || '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-navy-600 uppercase tracking-wide">Last inspection</span>
              <span className="text-sm text-slate-300">{formatDate(airstrip.last_inspection_date)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-navy-600 uppercase tracking-wide">Last status change</span>
              <span className="text-sm text-slate-300">{formatDate(airstrip.last_status_changed_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/airstrips/${airstrip.id}`} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
              Open in airstrips <ExternalLink className="h-3 w-3" />
            </Link>
            <button onClick={() => { setSelecting(true); loadOptions(); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Change link
            </button>
            <button onClick={() => setLink(null)} disabled={saving} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 disabled:opacity-40">
              <Unlink className="h-3.5 w-3.5" /> Remove link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No link (or re-selecting) — dropdown to set nearest_airstrip_id manually.
  return (
    <div className="max-w-2xl">
      <div className="card-premium p-6">
        <div className="rounded-xl border border-dashed border-navy-800 py-6 px-4 text-center mb-5">
          <MapPin className="h-6 w-6 text-navy-700 mx-auto mb-2" />
          <p className="text-sm text-white font-medium">{selecting ? 'Select serving airstrip' : 'No airstrip linked'}</p>
          <p className="text-xs text-navy-600 mt-1 max-w-md mx-auto">
            The community→airstrip link is set manually and human-reviewed. Airstrip names are not a clean match to
            community names, so nothing is auto-linked. Pick the nearest / serving airstrip below.
          </p>
        </div>
        <AirstripPicker options={options} onOpen={loadOptions} onPick={setLink} saving={saving} />
        {selecting && (
          <button onClick={() => setSelecting(false)} className="btn-navy px-3 py-1.5 text-xs mt-3">Cancel</button>
        )}
      </div>
    </div>
  );
}

function AirstripPicker({ options, onOpen, onPick, saving }: {
  options: AirstripOption[] | null; onOpen: () => void; onPick: (id: string) => void; saving: boolean;
}) {
  const [value, setValue] = useState('');
  useEffect(() => { onOpen(); }, [onOpen]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={options == null || saving}
        className={`${inputClass} max-w-xs`}
        aria-label="Select airstrip"
      >
        <option value="">{options == null ? 'Loading airstrips…' : 'Select an airstrip…'}</option>
        {(options ?? []).map(o => <option key={o.id} value={o.id}>{o.name} (R{o.region})</option>)}
      </select>
      <button
        onClick={() => value && onPick(value)}
        disabled={!value || saving}
        className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Link airstrip
      </button>
    </div>
  );
}
