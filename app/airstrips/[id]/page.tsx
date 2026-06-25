'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  PlaneLanding, ArrowLeft, RefreshCw, Edit3, MapPin,
  Wrench, Camera, ClipboardCheck, History, Info,
  Check, X, Loader2, ChevronDown, ChevronRight,
  Trash2, Upload, Signal, SignalZero, ExternalLink, ImageIcon,
} from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import {
  STATUS_CONFIG, CONDITION_CONFIG, FREQUENCY_CONFIG,
  ACTIVITY_CONFIG, VERIFICATION_CONFIG, VEGETATION_CONFIG,
  AIRSTRIP_STATUSES, SURFACE_CONDITIONS, ACTIVITY_TYPES,
  VERIFICATION_METHODS, PHOTO_TYPES, VEGETATION_STATUSES,
  quarterFromISODate, currentQuarter,
} from '@/lib/airstrip-types';
import type {
  Airstrip, AirstripMaintenanceLog, AirstripPhoto,
  AirstripInspection, AirstripStatusLog,
} from '@/lib/airstrip-types';
import AddEditAirstripModal from '@/components/airstrips/AddEditAirstripModal';
import { WarningBadges } from '@/components/airstrips/WarningBadges';
import ResponsibilityModal from '@/components/airstrips/ResponsibilityModal';
import type { AirstripCadence, AirstripResponsibility } from '@/lib/airstrips/warnings';
import { useAirstripOptions } from '@/hooks/useAirstripOptions';

// ── Types ────────────────────────────────────────────────────────────────────

interface QuickStats {
  currentQuarter: string;
  maintenanceThisQuarter: number;
  verifiedThisQuarter: number;
  unverifiedThisQuarter: number;
}

// Airstrip augmented by the detail API (airstrip_overview + warning engine).
export type DetailAirstrip = Airstrip & {
  last_maintenance_on?: string | null;
  last_verified_on?: string | null;
  target_maintenance_interval_days?: number | null;
  responsible_manager_id?: string | null;
  intervalDays?: number;
  cadence?: AirstripCadence;
  responsibility?: AirstripResponsibility;
};

interface DetailData {
  airstrip: DetailAirstrip;
  maintenance: AirstripMaintenanceLog[];
  photos: AirstripPhoto[];
  inspections: AirstripInspection[];
  statusLog: AirstripStatusLog[];
  quickStats: QuickStats;
}

type TabId = 'overview' | 'maintenance' | 'photos' | 'inspections' | 'history';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ConfigBadge({ value, config }: { value: string | null; config: Record<string, { label: string; color: string }> }) {
  if (!value) return <span className="text-navy-600 text-sm">—</span>;
  const cfg = config[value];
  if (!cfg) return <span className="text-sm text-white">{value}</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

function formatDate(date: string | null): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeTime(date: string | null): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}


function getQuarter(date: string): string {
  return quarterFromISODate(date) ?? '';
}

// Photos are served through the auth-gated proxy route (bucket is private — no
// public or signed URLs). Keyed off the photo itself so every call site works
// without threading the airstrip id through props.
function photoFileUrl(photo: AirstripPhoto): string {
  return `/api/airstrips/${photo.airstrip_id}/photos/${photo.id}/file`;
}

// ── Modal Wrapper ────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleEscape); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-navy-950 border border-navy-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Form field helper ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors';
const selectClass = inputClass;

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function AirstripDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Modal states
  const [responsibilityOpen, setResponsibilityOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<AirstripPhoto | null>(null);
  const [expandedInspection, setExpandedInspection] = useState<string | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<AirstripMaintenanceLog | null>(null);
  const [managingPhotosFor, setManagingPhotosFor] = useState<AirstripMaintenanceLog | null>(null);
  const [editingInspection, setEditingInspection] = useState<AirstripInspection | null>(null);

  // Fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airstrips/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Airstrip not found' : 'Failed to fetch');
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
        <div className="h-8 w-32 rounded bg-navy-900/50 animate-pulse" />
        <div className="h-32 rounded-xl bg-navy-900/50 animate-pulse" />
        <div className="h-64 rounded-xl bg-navy-900/50 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/airstrips" className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Airstrips
        </Link>
        <div className="card-premium p-8 text-center">
          <p className="text-red-400 mb-3">{error || 'Not found'}</p>
          <button onClick={fetchData} className="btn-navy px-4 py-2 text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const { airstrip: a, maintenance, photos, inspections, statusLog, quickStats } = data;

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, badge: quickStats.unverifiedThisQuarter || undefined },
    { id: 'photos', label: 'Photos', icon: Camera, badge: photos.length || undefined },
    { id: 'inspections', label: 'Inspections', icon: ClipboardCheck, badge: inspections.length || undefined },
    { id: 'history', label: 'Status History', icon: History, badge: statusLog.length || undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/airstrips" className="inline-flex items-center gap-1.5 text-sm text-navy-600 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Airstrips
      </Link>

      {/* ── Header ── */}
      <div className="card-premium p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <PlaneLanding className="h-5 w-5 text-gold-500" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{a.name}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <ConfigBadge value={a.status} config={STATUS_CONFIG} />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-navy-800 text-xs font-medium text-white">
                  Region {a.region}
                </span>
                <ConfigBadge value={a.flight_frequency} config={FREQUENCY_CONFIG} />
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${a.engineered_structure ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-navy-800 text-navy-600'}`}>
                  {a.engineered_structure ? 'Engineered' : 'Non-Engineered'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setStatusModalOpen(true)} className="btn-navy px-3 py-2 text-xs flex items-center gap-1.5">
              Change Status
            </button>
            <button onClick={() => setEditModalOpen(true)} className="btn-navy px-3 py-2 text-xs flex items-center gap-1.5">
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </button>
            <button onClick={fetchData} className="p-2 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={t => setActiveTab(t as TabId)} compactOnMobile>
        <div className="mt-6">
          {activeTab === 'overview' && <OverviewTab airstrip={a} quickStats={quickStats} onEditResponsibility={() => setResponsibilityOpen(true)} />}
          {activeTab === 'maintenance' && (
            <MaintenanceTab
              maintenance={maintenance}
              photos={photos}
              onLogMaintenance={() => setMaintenanceModalOpen(true)}
              onVerify={async (maintenanceId) => {
                await fetch(`/api/airstrips/${id}/maintenance`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ maintenance_id: maintenanceId }),
                });
                fetchData();
              }}
              onEdit={setEditingMaintenance}
              onManagePhotos={setManagingPhotosFor}
              onViewPhoto={setLightboxPhoto}
            />
          )}
          {activeTab === 'photos' && (
            <PhotosTab
              photos={photos}
              airstripId={id}
              onUpload={() => setPhotoUploadOpen(true)}
              onViewPhoto={setLightboxPhoto}
              onDelete={async (photoId) => {
                if (!confirm('Delete this photo?')) return;
                await fetch(`/api/airstrips/${id}/photos`, {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ photo_id: photoId }),
                });
                fetchData();
              }}
            />
          )}
          {activeTab === 'inspections' && (
            <InspectionsTab
              inspections={inspections}
              expandedId={expandedInspection}
              onToggleExpand={setExpandedInspection}
              onAddInspection={() => setInspectionModalOpen(true)}
              onEdit={setEditingInspection}
            />
          )}
          {activeTab === 'history' && <StatusHistoryTab statusLog={statusLog} />}
        </div>
      </Tabs>

      {/* ── Modals ── */}
      <ResponsibilityModal
        open={responsibilityOpen}
        onClose={() => setResponsibilityOpen(false)}
        airstripId={a.id}
        currentContractorId={a.responsibility?.contractorId ?? null}
        currentManagerId={a.responsibility?.managerId ?? null}
        onSaved={fetchData}
      />
      <AddEditAirstripModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={fetchData}
        airstrip={a}
      />
      <ChangeStatusModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        currentStatus={a.status}
        airstripId={id}
        onSaved={fetchData}
      />
      <LogMaintenanceModal
        open={maintenanceModalOpen}
        onClose={() => setMaintenanceModalOpen(false)}
        airstripId={id}
        onSaved={fetchData}
      />
      <AddInspectionModal
        open={inspectionModalOpen}
        onClose={() => setInspectionModalOpen(false)}
        airstripId={id}
        onSaved={fetchData}
      />
      <PhotoUploadModal
        open={photoUploadOpen}
        onClose={() => setPhotoUploadOpen(false)}
        airstripId={id}
        onSaved={fetchData}
      />
      <EditMaintenanceModal
        key={`edit-maint-${editingMaintenance?.id ?? 'none'}`}
        log={editingMaintenance}
        onClose={() => setEditingMaintenance(null)}
        airstripId={id}
        onSaved={fetchData}
      />
      <MaintenancePhotosModal
        key={`maint-photos-${managingPhotosFor?.id ?? 'none'}`}
        log={managingPhotosFor}
        photos={managingPhotosFor ? photos.filter(p => p.maintenance_log_id === managingPhotosFor.id) : []}
        onClose={() => setManagingPhotosFor(null)}
        airstripId={id}
        onSaved={fetchData}
        onViewPhoto={setLightboxPhoto}
      />
      <EditInspectionModal
        key={`edit-insp-${editingInspection?.id ?? 'none'}`}
        inspection={editingInspection}
        onClose={() => setEditingInspection(null)}
        airstripId={id}
        onSaved={fetchData}
      />
      {lightboxPhoto && (
        <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ════════════════════════════════════════════════════════════════════════════

function OverviewTab({ airstrip: a, quickStats, onEditResponsibility }: {
  airstrip: DetailAirstrip;
  quickStats: QuickStats;
  onEditResponsibility: () => void;
}) {
  const { labelFor: surfaceLabel } = useAirstripOptions('surface_type');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left — Infrastructure Details */}
      <div className="lg:col-span-2 card-premium p-5">
        <h3 className="text-sm font-semibold text-gold-500 uppercase tracking-wide mb-4">Infrastructure Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailRow label="Runway Length" value={a.runway_length_m ? `${a.runway_length_m}m` : null} />
          <DetailRow label="Runway Width" value={a.runway_width_m ? `${a.runway_width_m}m` : null} />
          <DetailRow label="Surface Type" value={a.surface_type ? surfaceLabel(a.surface_type) : null} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-navy-600 uppercase tracking-wide">Surface Condition</span>
            <ConfigBadge value={a.surface_condition} config={CONDITION_CONFIG} />
          </div>
          <DetailRow label="Engineered Structure" value={a.engineered_structure ? 'Yes' : 'No'} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-navy-600 uppercase tracking-wide">Flight Frequency</span>
            <ConfigBadge value={a.flight_frequency} config={FREQUENCY_CONFIG} />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <span className="text-xs text-navy-600 uppercase tracking-wide">Airside Buildings</span>
            <p className="text-sm text-slate-300">{a.airside_buildings || <span className="text-navy-600">—</span>}</p>
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <span className="text-xs text-navy-600 uppercase tracking-wide">Coordinates</span>
            {a.coordinates_lat && a.coordinates_lon ? (
              <a
                href={`https://maps.google.com/?q=${a.coordinates_lat},${a.coordinates_lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gold-500 hover:text-gold-400 inline-flex items-center gap-1"
              >
                <MapPin className="h-3.5 w-3.5" /> {a.coordinates_lat}, {a.coordinates_lon}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-sm text-navy-600">Not yet recorded</span>
            )}
          </div>
          {a.remarks && (
            <div className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-xs text-navy-600 uppercase tracking-wide">Remarks</span>
              <p className="text-sm text-slate-300">{a.remarks}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right — Health, Responsibility & Quick Stats */}
      <div className="space-y-3">
        {/* Maintenance health (cadence-derived) */}
        <div className={`glass-card p-4 space-y-2 ${a.cadence?.attentionLevel === 'overdue' ? 'border-red-500/40' : ''}`}>
          <span className="text-xs text-navy-600 uppercase tracking-wide">Maintenance Health</span>
          {a.cadence && a.cadence.warnings.length > 0
            ? <WarningBadges cadence={a.cadence} />
            : <p className="text-sm text-emerald-400">On cadence</p>}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-navy-600">Next due</span>
            <span className="text-slate-300">{a.cadence?.nextDueOn ? formatDate(a.cadence.nextDueOn) : '—'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-navy-600">Interval</span>
            <span className="text-slate-300">{a.intervalDays ?? '—'} days{a.target_maintenance_interval_days ? ' (override)' : ''}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-navy-600">Last maintenance</span>
            <span className="text-slate-300">{formatDate(a.last_maintenance_on ?? null)}</span>
          </div>
        </div>

        {/* Responsibility */}
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-navy-600 uppercase tracking-wide">Responsibility</span>
            <button onClick={onEditResponsibility} className="text-xs text-gold-500 hover:text-gold-400">Edit</button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-navy-600 text-xs">Contractor</span>
            <span className={a.responsibility?.contractorName ? 'text-white' : 'text-red-400'}>
              {a.responsibility?.contractorName || 'Unassigned'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-navy-600 text-xs">Manager</span>
            <span className={a.responsibility?.managerName ? 'text-white' : 'text-red-400'}>
              {a.responsibility?.managerName || 'Unassigned'}
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <span className="text-xs text-navy-600 uppercase tracking-wide">Last Inspection</span>
          <p className="text-lg font-semibold text-white">{formatDate(a.last_inspection_date)}</p>
          {a.last_inspection_date && <p className="text-xs text-navy-600">{relativeTime(a.last_inspection_date)}</p>}
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-navy-600 uppercase tracking-wide">Maintenance ({quickStats.currentQuarter})</span>
          <p className="text-lg font-semibold text-white">{quickStats.maintenanceThisQuarter} activities</p>
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-navy-600 uppercase tracking-wide">Verified ({quickStats.currentQuarter})</span>
          <p className="text-lg font-semibold text-emerald-400">{quickStats.verifiedThisQuarter}</p>
        </div>
        <div className={`glass-card p-4 ${quickStats.unverifiedThisQuarter > 0 ? 'border-red-500/40' : ''}`}>
          <span className="text-xs text-navy-600 uppercase tracking-wide">Unverified ({quickStats.currentQuarter})</span>
          <p className={`text-lg font-semibold ${quickStats.unverifiedThisQuarter > 0 ? 'text-red-400' : 'text-white'}`}>
            {quickStats.unverifiedThisQuarter}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-navy-600 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-300">{value || <span className="text-navy-600">—</span>}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: MAINTENANCE
// ════════════════════════════════════════════════════════════════════════════

function MaintenanceTab({ maintenance, photos, onLogMaintenance, onVerify, onEdit, onManagePhotos, onViewPhoto }: {
  maintenance: AirstripMaintenanceLog[];
  photos: AirstripPhoto[];
  onLogMaintenance: () => void;
  onVerify: (id: string) => Promise<void>;
  onEdit: (log: AirstripMaintenanceLog) => void;
  onManagePhotos: (log: AirstripMaintenanceLog) => void;
  onViewPhoto: (photo: AirstripPhoto) => void;
}) {
  const { labelFor: activityLabel } = useAirstripOptions('activity_type');
  const photosByLogId = React.useMemo(() => {
    const map = new Map<string, AirstripPhoto[]>();
    for (const p of photos) {
      if (!p.maintenance_log_id) continue;
      const arr = map.get(p.maintenance_log_id) ?? [];
      arr.push(p);
      map.set(p.maintenance_log_id, arr);
    }
    return map;
  }, [photos]);
  const quarters = [...new Set(maintenance.map(m => m.quarter).filter((q): q is string => !!q))].sort().reverse();
  const [selectedQuarter, setSelectedQuarter] = useState(() => currentQuarter());

  const filtered = maintenance.filter(m => m.quarter === selectedQuarter);
  const verifiedCount = filtered.filter(m => m.verified).length;
  const totalCount = filtered.length;
  const verifiedPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

  // Include current quarter in dropdown even if no data
  const allQuarters = [...new Set([selectedQuarter, ...quarters])].sort().reverse();

  return (
    <div className="space-y-4">
      {/* Quarter selector + action */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <select
          value={selectedQuarter}
          onChange={e => setSelectedQuarter(e.target.value)}
          className={selectClass + ' max-w-[200px]'}
          aria-label="Select quarter"
        >
          {allQuarters.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <button onClick={onLogMaintenance} className="btn-gold px-3 py-2 text-xs flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> Log Maintenance
        </button>
      </div>

      {/* Quarter summary */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white font-medium">{totalCount} activities logged</span>
          <span className="text-xs text-navy-600">{verifiedCount} verified / {totalCount - verifiedCount} unverified</span>
        </div>
        <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${verifiedPct}%` }} />
        </div>
        <p className="text-xs text-navy-600 mt-1">{verifiedPct}% verified</p>
      </div>

      {/* Maintenance table */}
      {filtered.length === 0 ? (
        <p className="text-center text-navy-600 text-sm py-6">No maintenance logged for {selectedQuarter}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-800">
          <table className="table-premium min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left text-xs">Date</th>
                <th className="px-3 py-3 text-left text-xs">Activity</th>
                <th className="px-3 py-3 text-left text-xs">Contractor</th>
                <th className="px-3 py-3 text-left text-xs">Verification</th>
                <th className="px-3 py-3 text-center text-xs">Verified</th>
                <th className="px-3 py-3 text-left text-xs">Photos</th>
                <th className="px-3 py-3 text-right text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const linkedPhotos = photosByLogId.get(m.id) ?? [];
                return (
                  <tr key={m.id} className="border-t border-navy-800/40 align-top">
                    <td className="px-3 py-2.5 text-xs text-slate-400">{formatDate(m.performed_date)}</td>
                    <td className="px-3 py-2.5 text-sm text-white">
                      {activityLabel(m.activity_type)}
                      {m.activity_description && <p className="text-xs text-navy-600 mt-0.5">{m.activity_description}</p>}
                      {m.notes && <p className="text-xs text-navy-600 mt-0.5 italic">{m.notes}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{m.contractor_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      <ConfigBadge value={m.verification_method} config={VERIFICATION_CONFIG} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {m.verified
                        ? <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                        : <X className="h-4 w-4 text-red-400 mx-auto" />
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      {linkedPhotos.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {linkedPhotos.slice(0, 3).map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => onViewPhoto(p)}
                              className="h-10 w-10 rounded-md bg-navy-900 overflow-hidden border border-navy-800 hover:border-gold-500/60 transition-colors shrink-0"
                              title={p.caption || p.file_name || 'View photo'}
                            >
                              <img src={photoFileUrl(p)} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </button>
                          ))}
                          {linkedPhotos.length > 3 && (
                            <span className="text-[10px] text-navy-600">+{linkedPhotos.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-navy-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {!m.verified && (
                          <button onClick={() => onVerify(m.id)} className="text-xs text-gold-500 hover:text-gold-400 transition-colors">Verify</button>
                        )}
                        <button onClick={() => onManagePhotos(m)} className="text-xs text-navy-600 hover:text-white transition-colors inline-flex items-center gap-1" title="Manage photos">
                          <ImageIcon className="h-3.5 w-3.5" /> Photos
                        </button>
                        <button onClick={() => onEdit(m)} className="text-xs text-navy-600 hover:text-white transition-colors inline-flex items-center gap-1" title="Edit log">
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: PHOTOS
// ════════════════════════════════════════════════════════════════════════════

function PhotosTab({ photos, airstripId, onUpload, onViewPhoto, onDelete }: {
  photos: AirstripPhoto[];
  airstripId: string;
  onUpload: () => void;
  onViewPhoto: (p: AirstripPhoto) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const filtered = typeFilter === 'all' ? photos : photos.filter(p => p.photo_type === typeFilter);

  return (
    <div className="space-y-4">
      {/* Filter bar + upload */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {['all', ...PHOTO_TYPES].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-gold-500/20 text-gold-500' : 'text-navy-600 hover:text-white hover:bg-navy-800'}`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={onUpload} className="btn-gold px-3 py-2 text-xs flex items-center gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Upload Photos
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-navy-600 text-sm py-6">No photos {typeFilter !== 'all' ? `of type "${typeFilter}"` : ''}.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(p => (
            <div key={p.id} className="card-premium p-0 overflow-hidden group relative">
              <button onClick={() => onViewPhoto(p)} className="block w-full">
                <div className="aspect-[4/3] bg-navy-900 overflow-hidden">
                  <img
                    src={photoFileUrl(p)}
                    alt={p.caption || p.file_name || 'Airstrip photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                </div>
              </button>
              <div className="p-2.5 space-y-1">
                {p.caption && <p className="text-xs text-white truncate">{p.caption}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-navy-600 uppercase">{p.photo_type || 'general'}</span>
                  {p.taken_at && <span className="text-[10px] text-navy-600">{formatDate(p.taken_at)}</span>}
                </div>
              </div>
              <button
                onClick={() => onDelete(p.id)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lightbox
function Lightbox({ photo, onClose }: { photo: AirstripPhoto; onClose: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white" aria-label="Close">
        <X className="h-6 w-6" />
      </button>
      <div className="max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <img
          src={photoFileUrl(photo)}
          alt={photo.caption || 'Airstrip photo'}
          className="max-h-[75vh] rounded-lg object-contain"
        />
        {(photo.caption || photo.photo_type) && (
          <div className="mt-3 text-center">
            {photo.caption && <p className="text-white text-sm">{photo.caption}</p>}
            <p className="text-navy-600 text-xs mt-1">
              {photo.photo_type} {photo.taken_at && `• ${formatDate(photo.taken_at)}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: INSPECTIONS
// ════════════════════════════════════════════════════════════════════════════

function InspectionsTab({ inspections, expandedId, onToggleExpand, onAddInspection, onEdit }: {
  inspections: AirstripInspection[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onAddInspection: () => void;
  onEdit: (insp: AirstripInspection) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={onAddInspection} className="btn-gold px-3 py-2 text-xs flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" /> Add Inspection
        </button>
      </div>

      {inspections.length === 0 ? (
        <p className="text-center text-navy-600 text-sm py-6">No inspections recorded.</p>
      ) : (
        <div className="space-y-2">
          {inspections.map(insp => {
            const expanded = expandedId === insp.id;
            return (
              <div key={insp.id} className="card-premium overflow-hidden">
                <div className="w-full flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onToggleExpand(expanded ? null : insp.id)}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 text-gold-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-navy-600 shrink-0" />}
                    <span className="text-sm text-white font-medium min-w-[90px] shrink-0">{formatDate(insp.inspection_date)}</span>
                    <span className="text-xs text-slate-400 truncate flex-1">{insp.inspector_name || 'Unknown inspector'}</span>
                    <ConfigBadge value={insp.surface_condition} config={CONDITION_CONFIG} />
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      {VEGETATION_CONFIG[insp.vegetation_status as keyof typeof VEGETATION_CONFIG]?.label || insp.vegetation_status || '—'}
                    </span>
                    {insp.signal_available === true && <Signal className="h-4 w-4 text-emerald-400 shrink-0" />}
                    {insp.signal_available === false && <SignalZero className="h-4 w-4 text-red-400 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(insp)}
                    className="text-xs text-navy-600 hover:text-white transition-colors inline-flex items-center gap-1 shrink-0"
                    title="Edit inspection"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-navy-800/40 space-y-3">
                    {insp.runway_condition_notes && <DetailBlock label="Runway Condition" text={insp.runway_condition_notes} />}
                    {insp.drainage_condition && <DetailBlock label="Drainage Condition" text={insp.drainage_condition} />}
                    {insp.buildings_condition && <DetailBlock label="Buildings Condition" text={insp.buildings_condition} />}
                    {insp.findings && <DetailBlock label="Findings" text={insp.findings} />}
                    {insp.recommendations && <DetailBlock label="Recommendations" text={insp.recommendations} />}
                    {insp.remarks && <DetailBlock label="Remarks" text={insp.remarks} />}
                    {insp.vegetation_status && (
                      <div>
                        <span className="text-xs text-navy-600 uppercase tracking-wide block mb-1">Vegetation Status</span>
                        <ConfigBadge value={insp.vegetation_status} config={VEGETATION_CONFIG} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-xs text-navy-600 uppercase tracking-wide block mb-0.5">{label}</span>
      <p className="text-sm text-slate-300">{text}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB: STATUS HISTORY
// ════════════════════════════════════════════════════════════════════════════

function StatusHistoryTab({ statusLog }: { statusLog: AirstripStatusLog[] }) {
  if (statusLog.length === 0) {
    return <p className="text-center text-navy-600 text-sm py-6">No status changes recorded.</p>;
  }

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-navy-800" />

      <div className="space-y-6">
        {statusLog.map(entry => (
          <div key={entry.id} className="relative">
            {/* Timeline dot */}
            <div className="absolute -left-3.5 top-1 w-3 h-3 rounded-full border-2 border-navy-800 bg-gold-500" />
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs text-navy-600">{formatDate(entry.changed_at)}</span>
                {entry.changed_by_name && (
                  <span className="text-xs text-slate-400">by {entry.changed_by_name}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {entry.previous_status && <ConfigBadge value={entry.previous_status} config={STATUS_CONFIG} />}
                {entry.previous_status && <span className="text-navy-600">→</span>}
                <ConfigBadge value={entry.new_status} config={STATUS_CONFIG} />
              </div>
              {entry.reason && <p className="text-sm text-slate-300 mt-2">{entry.reason}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════════════════

function ChangeStatusModal({ open, onClose, currentStatus, airstripId, onSaved }: {
  open: boolean; onClose: () => void; currentStatus: string; airstripId: string; onSaved: () => void;
}) {
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNewStatus(''); setReason(''); } }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus || !reason.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/airstrips/${airstripId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, reason }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); return; }
      onSaved();
      onClose();
    } catch { alert('Failed to change status'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Status">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-600">Current:</span>
          <ConfigBadge value={currentStatus} config={STATUS_CONFIG} />
        </div>
        <Field label="New Status">
          <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={selectClass} required>
            <option value="">Select status…</option>
            {AIRSTRIP_STATUSES.filter(s => s !== currentStatus).map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason (required)">
          <textarea value={reason} onChange={e => setReason(e.target.value)} className={inputClass} rows={3} required placeholder="Why is the status changing?" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !newStatus || !reason.trim()} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Change Status
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LogMaintenanceModal({ open, onClose, airstripId, onSaved }: {
  open: boolean; onClose: () => void; airstripId: string; onSaved: () => void;
}) {
  const { options: activityOpts, loading: loadingAct } = useAirstripOptions('activity_type');
  const { options: verifyOpts, loading: loadingVer } = useAirstripOptions('verification_method');

  const [activityType, setActivityType] = useState('');
  const [description, setDescription] = useState('');
  const [performedDate, setPerformedDate] = useState('');
  const [contractor, setContractor] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setActivityType(''); setDescription(''); setPerformedDate('');
      setContractor(''); setVerificationMethod(''); setNotes('');
      setPhotoFiles([]);
    }
  }, [open]);

  const quarter = performedDate ? getQuarter(performedDate) : '';

  // Photo upload applies to photo-based verification methods
  const showPhotoUpload = verificationMethod === 'whatsapp_photo' || verificationMethod === 'photo_verification';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activityType || !performedDate || !verificationMethod) return;
    setSaving(true);
    try {
      // 1. Create maintenance log
      const res = await fetch(`/api/airstrips/${airstripId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: activityType,
          activity_description: activityType === 'other' ? description : null,
          performed_date: performedDate,
          contractor_name: contractor,
          verification_method: verificationMethod,
          notes,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); setSaving(false); return; }
      const { maintenance } = await res.json();

      // 2. Upload verification photos if any. The maintenance log is already saved,
      // so a photo failure is a NON-fatal warning — never report it as a log failure
      // (that would prompt a re-submit and duplicate the log). Guarded separately so
      // it can't fall through to the outer "Failed to log maintenance" catch.
      let failedPhotos = 0;
      if (photoFiles.length > 0 && showPhotoUpload) {
        try {
          const formData = new FormData();
          photoFiles.forEach(f => formData.append('files', f));
          formData.append('photo_type', 'verification');
          formData.append('maintenance_log_id', maintenance.id);
          const photoRes = await fetch(`/api/airstrips/${airstripId}/photos`, { method: 'POST', body: formData });
          if (!photoRes.ok) {
            failedPhotos = photoFiles.length;
          } else {
            const { failures } = await photoRes.json();
            failedPhotos = Array.isArray(failures) ? failures.length : 0;
          }
        } catch {
          failedPhotos = photoFiles.length;
        }
      }

      if (failedPhotos > 0) {
        alert(`Maintenance logged, but ${failedPhotos} verification photo(s) failed to upload. Re-add them from the Photos tab.`);
      }
      onSaved();
      onClose();
    } catch { alert('Failed to log maintenance'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log Maintenance">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Activity Type">
          <select value={activityType} onChange={e => setActivityType(e.target.value)} className={selectClass} required disabled={loadingAct}>
            <option value="">{loadingAct ? 'Loading…' : 'Select…'}</option>
            {activityOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {activityType === 'other' && (
          <Field label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={inputClass} rows={2} placeholder="Describe the activity" />
          </Field>
        )}
        <Field label="Date Performed">
          <input type="date" value={performedDate} onChange={e => setPerformedDate(e.target.value)} className={inputClass} required />
        </Field>
        {quarter && (
          <div className="text-xs text-navy-600">Quarter: <span className="text-slate-400">{quarter}</span></div>
        )}
        <Field label="Contractor Name">
          <input type="text" value={contractor} onChange={e => setContractor(e.target.value)} className={inputClass} placeholder="Contractor or team" />
        </Field>
        <Field label="Verification Method">
          <select value={verificationMethod} onChange={e => setVerificationMethod(e.target.value)} className={selectClass} required disabled={loadingVer}>
            <option value="">{loadingVer ? 'Loading…' : 'Select…'}</option>
            {verifyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {showPhotoUpload && (
          <Field label="Verification Photos">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={e => setPhotoFiles(Array.from(e.target.files || []))}
              className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-navy-800 file:text-white file:text-xs file:font-medium hover:file:bg-navy-700"
            />
            {photoFiles.length > 0 && <p className="text-xs text-navy-600 mt-1">{photoFiles.length} file(s) selected</p>}
          </Field>
        )}
        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} rows={2} placeholder="Optional notes" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !activityType || !performedDate || !verificationMethod} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log Maintenance
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddInspectionModal({ open, onClose, airstripId, onSaved }: {
  open: boolean; onClose: () => void; airstripId: string; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    inspection_date: '', inspector_name: '', surface_condition: '',
    runway_condition_notes: '', vegetation_status: '',
    drainage_condition: '', buildings_condition: '',
    findings: '', recommendations: '', remarks: '', signal_available: null as boolean | null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({
      inspection_date: '', inspector_name: '', surface_condition: '',
      runway_condition_notes: '', vegetation_status: '',
      drainage_condition: '', buildings_condition: '',
      findings: '', recommendations: '', remarks: '', signal_available: null,
    });
  }, [open]);

  function update(field: string, value: string | boolean | null) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inspection_date) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/airstrips/${airstripId}/inspections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
      onClose();
    } catch { alert('Failed to add inspection'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Inspection">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Inspection Date">
            <input type="date" value={form.inspection_date} onChange={e => update('inspection_date', e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Inspector Name">
            <input type="text" value={form.inspector_name} onChange={e => update('inspector_name', e.target.value)} className={inputClass} placeholder="Name" />
          </Field>
          <Field label="Surface Condition">
            <select value={form.surface_condition} onChange={e => update('surface_condition', e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {SURFACE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Vegetation Status">
            <select value={form.vegetation_status} onChange={e => update('vegetation_status', e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {VEGETATION_STATUSES.map(v => <option key={v} value={v}>{VEGETATION_CONFIG[v].label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Runway Condition Notes">
          <textarea value={form.runway_condition_notes} onChange={e => update('runway_condition_notes', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Drainage Condition">
          <textarea value={form.drainage_condition} onChange={e => update('drainage_condition', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Buildings Condition">
          <textarea value={form.buildings_condition} onChange={e => update('buildings_condition', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Findings">
          <textarea value={form.findings} onChange={e => update('findings', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Recommendations">
          <textarea value={form.recommendations} onChange={e => update('recommendations', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Remarks">
          <textarea value={form.remarks} onChange={e => update('remarks', e.target.value)} className={inputClass} rows={2} placeholder="Optional remarks" />
        </Field>
        <Field label="Signal Available">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => update('signal_available', true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.signal_available === true ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-navy-800 text-navy-600'}`}>
              <Signal className="inline h-3.5 w-3.5 mr-1" /> Yes
            </button>
            <button type="button" onClick={() => update('signal_available', false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.signal_available === false ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-navy-800 text-navy-600'}`}>
              <SignalZero className="inline h-3.5 w-3.5 mr-1" /> No
            </button>
            {form.signal_available !== null && (
              <button type="button" onClick={() => update('signal_available', null)} className="text-xs text-navy-600 hover:text-white">Clear</button>
            )}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !form.inspection_date} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add Inspection
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PhotoUploadModal({ open, onClose, airstripId, onSaved }: {
  open: boolean; onClose: () => void; airstripId: string; onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [photoType, setPhotoType] = useState('general');
  const [caption, setCaption] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (open) { setFiles([]); setPhotoType('general'); setCaption(''); setTakenAt(''); setProgress(''); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;

    // Validate files
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { alert(`File too large: ${f.name}. Max 10MB.`); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { alert(`Invalid type: ${f.name}`); return; }
    }

    setUploading(true);
    setProgress(`Uploading ${files.length} file(s)...`);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('photo_type', photoType);
      if (caption) formData.append('caption', caption);
      if (takenAt) formData.append('taken_at', takenAt);

      const res = await fetch(`/api/airstrips/${airstripId}/photos`, { method: 'POST', body: formData });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Upload failed'); return; }

      const { photos } = await res.json();
      setProgress(`${photos.length} photo(s) uploaded successfully`);
      onSaved();
      setTimeout(onClose, 500);
    } catch { alert('Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload Photos">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Photos">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-navy-800 file:text-white file:text-xs file:font-medium hover:file:bg-navy-700"
          />
          <p className="text-xs text-navy-600 mt-1">JPG, PNG, WebP • Max 10MB per file</p>
          {files.length > 0 && <p className="text-xs text-gold-500 mt-1">{files.length} file(s) selected</p>}
        </Field>
        <Field label="Photo Type">
          <select value={photoType} onChange={e => setPhotoType(e.target.value)} className={selectClass}>
            {PHOTO_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Caption">
          <input type="text" value={caption} onChange={e => setCaption(e.target.value)} className={inputClass} placeholder="Optional caption" />
        </Field>
        <Field label="Date Taken">
          <input type="date" value={takenAt} onChange={e => setTakenAt(e.target.value)} className={inputClass} />
        </Field>
        {progress && <p className="text-xs text-gold-500">{progress}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={uploading || !files.length} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditMaintenanceModal({ log, onClose, airstripId, onSaved }: {
  log: AirstripMaintenanceLog | null;
  onClose: () => void;
  airstripId: string;
  onSaved: () => void;
}) {
  const { options: activityOpts } = useAirstripOptions('activity_type');
  const { options: verifyOpts } = useAirstripOptions('verification_method');

  const [activityType, setActivityType] = useState('');
  const [description, setDescription] = useState('');
  const [performedDate, setPerformedDate] = useState('');
  const [contractor, setContractor] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (log) {
      setActivityType(log.activity_type);
      setDescription(log.activity_description ?? '');
      setPerformedDate(log.performed_date);
      setContractor(log.contractor_name ?? '');
      setVerificationMethod(log.verification_method);
      setNotes(log.notes ?? '');
    }
  }, [log]);

  const open = !!log;
  const quarter = performedDate ? getQuarter(performedDate) : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!log || !activityType || !performedDate || !verificationMethod) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/airstrips/${airstripId}/maintenance/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: activityType,
          activity_description: activityType === 'other' ? description : null,
          performed_date: performedDate,
          contractor_name: contractor,
          verification_method: verificationMethod,
          notes,
        }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
      onClose();
    } catch { alert('Failed to update maintenance log'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Maintenance Log">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Activity Type">
          <select value={activityType} onChange={e => setActivityType(e.target.value)} className={selectClass} required>
            <option value="">Select…</option>
            {activityOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {activityType === 'other' && (
          <Field label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={inputClass} rows={2} />
          </Field>
        )}
        <Field label="Date Performed">
          <input type="date" value={performedDate} onChange={e => setPerformedDate(e.target.value)} className={inputClass} required />
        </Field>
        {quarter && (
          <div className="text-xs text-navy-600">Quarter: <span className="text-slate-400">{quarter}</span></div>
        )}
        <Field label="Contractor Name">
          <input type="text" value={contractor} onChange={e => setContractor(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Verification Method">
          <select value={verificationMethod} onChange={e => setVerificationMethod(e.target.value)} className={selectClass} required>
            <option value="">Select…</option>
            {verifyOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} rows={2} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !activityType || !performedDate || !verificationMethod} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MaintenancePhotosModal({ log, photos, onClose, airstripId, onSaved, onViewPhoto }: {
  log: AirstripMaintenanceLog | null;
  photos: AirstripPhoto[];
  onClose: () => void;
  airstripId: string;
  onSaved: () => void;
  onViewPhoto: (p: AirstripPhoto) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (log) { setFiles([]); setCaption(''); }
  }, [log]);

  const open = !!log;

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}_${f.size}_${f.lastModified}`));
      const merged = [...prev];
      for (const f of incoming) {
        const key = `${f.name}_${f.size}_${f.lastModified}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      }
      return merged;
    });
  }

  async function handleUpload() {
    if (!log || !files.length) return;
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { alert(`File too large: ${f.name}. Max 10MB.`); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { alert(`Invalid type: ${f.name}`); return; }
    }
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('photo_type', 'maintenance');
      formData.append('maintenance_log_id', log.id);
      if (caption) formData.append('caption', caption);
      const res = await fetch(`/api/airstrips/${airstripId}/photos`, { method: 'POST', body: formData });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Upload failed'); return; }
      setFiles([]);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      onSaved();
    } catch { alert('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleDelete(photoId: string) {
    if (!confirm('Delete this photo?')) return;
    const res = await fetch(`/api/airstrips/${airstripId}/photos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_id: photoId }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || 'Delete failed'); return; }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Maintenance Photos">
      <div className="space-y-4">
        {photos.length === 0 ? (
          <p className="text-center text-navy-600 text-sm py-3">No photos yet for this log.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative group rounded-lg overflow-hidden bg-navy-900 border border-navy-800">
                <button type="button" onClick={() => onViewPhoto(p)} className="block w-full aspect-square">
                  <img src={photoFileUrl(p)} alt={p.caption || ''} className="h-full w-full object-cover" loading="lazy" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 pt-2 border-t border-navy-800">
          <span className="text-xs font-medium text-navy-600 uppercase tracking-wide block">Add Photos</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={e => addFiles(Array.from(e.target.files || []))}
              className="hidden"
              id="maint-photo-files"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={e => addFiles(Array.from(e.target.files || []))}
              className="hidden"
              id="maint-photo-camera"
            />
            <label htmlFor="maint-photo-files" className="btn-navy px-3 py-2 text-xs flex items-center gap-1.5 cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Choose Files
            </label>
            <label htmlFor="maint-photo-camera" className="btn-navy px-3 py-2 text-xs flex items-center gap-1.5 cursor-pointer">
              <Camera className="h-3.5 w-3.5" /> Take Photo
            </label>
            {files.length > 0 && <span className="text-xs text-gold-500">{files.length} ready</span>}
          </div>
          {files.length > 0 && (
            <>
              <Field label="Caption (optional)">
                <input type="text" value={caption} onChange={e => setCaption(e.target.value)} className={inputClass} placeholder="Applies to all photos being uploaded" />
              </Field>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleUpload} disabled={uploading} className="btn-gold px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40">
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload {files.length}
                </button>
                <button type="button" onClick={() => setFiles([])} className="text-xs text-navy-600 hover:text-white">Clear</button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </Modal>
  );
}

function EditInspectionModal({ inspection, onClose, airstripId, onSaved }: {
  inspection: AirstripInspection | null;
  onClose: () => void;
  airstripId: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    inspection_date: '', inspector_name: '', surface_condition: '',
    runway_condition_notes: '', vegetation_status: '',
    drainage_condition: '', buildings_condition: '',
    findings: '', recommendations: '', remarks: '', signal_available: null as boolean | null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (inspection) {
      setForm({
        inspection_date: inspection.inspection_date,
        inspector_name: inspection.inspector_name ?? '',
        surface_condition: inspection.surface_condition ?? '',
        runway_condition_notes: inspection.runway_condition_notes ?? '',
        vegetation_status: inspection.vegetation_status ?? '',
        drainage_condition: inspection.drainage_condition ?? '',
        buildings_condition: inspection.buildings_condition ?? '',
        findings: inspection.findings ?? '',
        recommendations: inspection.recommendations ?? '',
        remarks: inspection.remarks ?? '',
        signal_available: inspection.signal_available,
      });
    }
  }, [inspection]);

  const open = !!inspection;

  function update(field: string, value: string | boolean | null) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inspection || !form.inspection_date) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/airstrips/${airstripId}/inspections/${inspection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); setSaving(false); return; }
      onSaved();
      onClose();
    } catch { alert('Failed to update inspection'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Inspection">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Inspection Date">
            <input type="date" value={form.inspection_date} onChange={e => update('inspection_date', e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Inspector Name">
            <input type="text" value={form.inspector_name} onChange={e => update('inspector_name', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Surface Condition">
            <select value={form.surface_condition} onChange={e => update('surface_condition', e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {SURFACE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Vegetation Status">
            <select value={form.vegetation_status} onChange={e => update('vegetation_status', e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {VEGETATION_STATUSES.map(v => <option key={v} value={v}>{VEGETATION_CONFIG[v].label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Runway Condition Notes">
          <textarea value={form.runway_condition_notes} onChange={e => update('runway_condition_notes', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Drainage Condition">
          <textarea value={form.drainage_condition} onChange={e => update('drainage_condition', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Buildings Condition">
          <textarea value={form.buildings_condition} onChange={e => update('buildings_condition', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Findings">
          <textarea value={form.findings} onChange={e => update('findings', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Recommendations">
          <textarea value={form.recommendations} onChange={e => update('recommendations', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Remarks">
          <textarea value={form.remarks} onChange={e => update('remarks', e.target.value)} className={inputClass} rows={2} />
        </Field>
        <Field label="Signal Available">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => update('signal_available', true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.signal_available === true ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-navy-800 text-navy-600'}`}>
              <Signal className="inline h-3.5 w-3.5 mr-1" /> Yes
            </button>
            <button type="button" onClick={() => update('signal_available', false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.signal_available === false ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-navy-800 text-navy-600'}`}>
              <SignalZero className="inline h-3.5 w-3.5 mr-1" /> No
            </button>
            {form.signal_available !== null && (
              <button type="button" onClick={() => update('signal_available', null)} className="text-xs text-navy-600 hover:text-white">Clear</button>
            )}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={saving || !form.inspection_date} className="btn-gold px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
