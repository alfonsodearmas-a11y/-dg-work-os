'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES,
  STATUS_CONFIG,
} from '@/lib/airstrip-types';
import type { Airstrip, AirstripStatus, SurfaceCondition, FlightFrequency } from '@/lib/airstrip-types';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pass an airstrip to enter edit mode. Omit for add mode. */
  airstrip?: Airstrip | null;
  /** Pre-loaded surface types to avoid redundant fetch. */
  surfaceTypes?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-navy-600 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass = 'w-full px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 text-white text-sm placeholder:text-navy-600 focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-colors';
const selectClass = inputClass;

// ── Modal ────────────────────────────────────────────────────────────────────

export default function AddEditAirstripModal({ open, onClose, onSaved, airstrip, surfaceTypes: surfaceTypesProp }: Props) {
  const isEdit = !!airstrip;
  const dialogRef = useRef<HTMLDivElement>(null);

  // ── Form state ──
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [engineered, setEngineered] = useState(false);
  const [runwayLength, setRunwayLength] = useState('');
  const [runwayWidth, setRunwayWidth] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [surfaceCondition, setSurfaceCondition] = useState('');
  const [flightFrequency, setFlightFrequency] = useState('');
  const [lastInspection, setLastInspection] = useState('');
  const [airsideBuildings, setAirsideBuildings] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState<string>('operational');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  // Status change reason (edit mode only, shown when status differs from original)
  const [statusChangeReason, setStatusChangeReason] = useState('');

  // Surface type datalist
  const [surfaceTypes, setSurfaceTypes] = useState<string[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Track original status to detect changes
  const originalStatus = airstrip?.status ?? null;
  const statusChanged = isEdit && status !== originalStatus;

  // ── Populate form on open ──
  useEffect(() => {
    if (!open) return;
    if (airstrip) {
      setName(airstrip.name);
      setRegion(String(airstrip.region));
      setEngineered(airstrip.engineered_structure);
      setRunwayLength(airstrip.runway_length_m != null ? String(airstrip.runway_length_m) : '');
      setRunwayWidth(airstrip.runway_width_m != null ? String(airstrip.runway_width_m) : '');
      setSurfaceType(airstrip.surface_type ?? '');
      setSurfaceCondition(airstrip.surface_condition ?? '');
      setFlightFrequency(airstrip.flight_frequency ?? '');
      setLastInspection(airstrip.last_inspection_date ?? '');
      setAirsideBuildings(airstrip.airside_buildings ?? '');
      setRemarks(airstrip.remarks ?? '');
      setStatus(airstrip.status);
      setLat(airstrip.coordinates_lat != null ? String(airstrip.coordinates_lat) : '');
      setLon(airstrip.coordinates_lon != null ? String(airstrip.coordinates_lon) : '');
    } else {
      setName(''); setRegion(''); setEngineered(false);
      setRunwayLength(''); setRunwayWidth('');
      setSurfaceType(''); setSurfaceCondition(''); setFlightFrequency('');
      setLastInspection(''); setAirsideBuildings(''); setRemarks('');
      setStatus('operational'); setLat(''); setLon('');
    }
    setStatusChangeReason('');
    setErrors({});
    setServerError(null);
    setSaving(false);
  }, [open, airstrip]);

  // ── Fetch distinct surface types for datalist (skip if provided via prop) ──
  useEffect(() => {
    if (!open || surfaceTypesProp) {
      if (surfaceTypesProp) setSurfaceTypes(surfaceTypesProp);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/airstrips?sort=name&dir=asc');
        if (!res.ok) return;
        const json = await res.json();
        const types = new Set<string>();
        for (const a of json.airstrips ?? []) {
          if (a.surface_type) types.add(a.surface_type);
        }
        setSurfaceTypes([...types].sort());
      } catch { /* non-critical */ }
    })();
  }, [open, surfaceTypesProp]);

  // ── Escape key ──
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  // ── Focus first input on open ──
  useEffect(() => {
    if (open && dialogRef.current) {
      const el = dialogRef.current.querySelector<HTMLElement>('input, select, textarea');
      el?.focus();
    }
  }, [open]);

  // ── Validation ──
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!region) errs.region = 'Region is required';
    else {
      const r = parseInt(region);
      if (isNaN(r) || r < 1 || r > 10) errs.region = 'Region must be 1–10';
    }
    if (runwayLength && (isNaN(Number(runwayLength)) || Number(runwayLength) <= 0)) errs.runway_length = 'Must be a positive number';
    if (runwayWidth && (isNaN(Number(runwayWidth)) || Number(runwayWidth) <= 0)) errs.runway_width = 'Must be a positive number';
    if (lat && (isNaN(Number(lat)) || Number(lat) < -90 || Number(lat) > 90)) errs.lat = 'Must be between -90 and 90';
    if (lon && (isNaN(Number(lon)) || Number(lon) < -180 || Number(lon) > 180)) errs.lon = 'Must be between -180 and 180';
    if (!status) errs.status = 'Status is required';
    if (statusChanged && !statusChangeReason.trim()) errs.status_change_reason = 'Reason is required when changing status';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [name, region, runwayLength, runwayWidth, lat, lon, status, statusChanged, statusChangeReason]);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setServerError(null);

    const payload = {
      name: name.trim(),
      region: parseInt(region),
      engineered_structure: engineered,
      runway_length_m: runwayLength ? Number(runwayLength) : null,
      runway_width_m: runwayWidth ? Number(runwayWidth) : null,
      surface_type: surfaceType.trim() || null,
      surface_condition: (surfaceCondition as SurfaceCondition) || null,
      flight_frequency: (flightFrequency as FlightFrequency) || null,
      last_inspection_date: lastInspection || null,
      airside_buildings: airsideBuildings.trim() || null,
      remarks: remarks.trim() || null,
      status: status as AirstripStatus,
      coordinates_lat: lat ? Number(lat) : null,
      coordinates_lon: lon ? Number(lon) : null,
      ...(statusChanged ? { status_change_reason: statusChangeReason.trim() } : {}),
    };

    try {
      const url = isEdit ? `/api/airstrips/${airstrip!.id}` : '/api/airstrips';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        // Handle parseBody validation errors ({ code, errors: { field: [msgs] } })
        if (err.errors && typeof err.errors === 'object') {
          const fieldErrors: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(err.errors)) {
            if (Array.isArray(msgs) && msgs.length) fieldErrors[key] = msgs[0] as string;
          }
          setErrors(prev => ({ ...prev, ...fieldErrors }));
        } else if (err.field) {
          setErrors(prev => ({ ...prev, [err.field]: err.error }));
        } else {
          setServerError(err.error || err.message || 'Failed to save');
        }
        return;
      }

      onSaved();
      onClose();
    } catch {
      setServerError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-edit-airstrip-title"
        className="bg-navy-950 border border-navy-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800 shrink-0">
          <h3 id="add-edit-airstrip-title" className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Airstrip' : 'Add Airstrip'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-navy-800 text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm">{serverError}</p>
            </div>
          )}


          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Field label="Name" required>
                <input
                  className={`${inputClass} ${errors.name ? 'border-red-500' : ''}`}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Kamarang"
                  aria-required="true"
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </Field>
            </div>
            <Field label="Region" required>
              <select
                className={`${selectClass} ${errors.region ? 'border-red-500' : ''}`}
                value={region}
                onChange={e => setRegion(e.target.value)}
                aria-required="true"
              >
                <option value="">Select</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(r => (
                  <option key={r} value={r}>Region {r}</option>
                ))}
              </select>
              {errors.region && <p className="text-red-400 text-xs mt-1">{errors.region}</p>}
            </Field>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Engineered Structure">
              <button
                type="button"
                onClick={() => setEngineered(!engineered)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                  engineered
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : 'bg-navy-900 border-navy-800 text-navy-600'
                }`}
              >
                <span className={`w-8 h-5 rounded-full relative transition-colors ${engineered ? 'bg-emerald-500' : 'bg-navy-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${engineered ? 'left-3.5' : 'left-0.5'}`} />
                </span>
                {engineered ? 'Yes' : 'No'}
              </button>
            </Field>
            <Field label="Status" required>
              <select
                className={`${selectClass} ${errors.status ? 'border-red-500' : ''}`}
                value={status}
                onChange={e => setStatus(e.target.value)}
                aria-required="true"
              >
                {AIRSTRIP_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              {errors.status && <p className="text-red-400 text-xs mt-1">{errors.status}</p>}
            </Field>
          </div>


          {statusChanged && (
            <Field label="Reason for Status Change" required>
              <textarea
                className={`${inputClass} min-h-[60px] ${errors.status_change_reason ? 'border-red-500' : ''}`}
                value={statusChangeReason}
                onChange={e => setStatusChangeReason(e.target.value)}
                placeholder="Briefly explain why the status is changing..."
                rows={2}
                aria-required="true"
              />
              {errors.status_change_reason && <p className="text-red-400 text-xs mt-1">{errors.status_change_reason}</p>}
            </Field>
          )}


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Runway Length (m)">
              <input
                type="number"
                className={`${inputClass} ${errors.runway_length ? 'border-red-500' : ''}`}
                value={runwayLength}
                onChange={e => setRunwayLength(e.target.value)}
                placeholder="e.g. 800"
                min="0"
                step="any"
              />
              {errors.runway_length && <p className="text-red-400 text-xs mt-1">{errors.runway_length}</p>}
            </Field>
            <Field label="Runway Width (m)">
              <input
                type="number"
                className={`${inputClass} ${errors.runway_width ? 'border-red-500' : ''}`}
                value={runwayWidth}
                onChange={e => setRunwayWidth(e.target.value)}
                placeholder="e.g. 23"
                min="0"
                step="any"
              />
              {errors.runway_width && <p className="text-red-400 text-xs mt-1">{errors.runway_width}</p>}
            </Field>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Surface Type">
              <input
                className={inputClass}
                value={surfaceType}
                onChange={e => setSurfaceType(e.target.value)}
                placeholder="e.g. Laterite"
                list="surface-type-options"
              />
              <datalist id="surface-type-options">
                {surfaceTypes.map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Surface Condition">
              <select className={selectClass} value={surfaceCondition} onChange={e => setSurfaceCondition(e.target.value)}>
                <option value="">Not specified</option>
                {SURFACE_CONDITIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Flight Frequency">
              <select className={selectClass} value={flightFrequency} onChange={e => setFlightFrequency(e.target.value)}>
                <option value="">Not specified</option>
                {FLIGHT_FREQUENCIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Last Inspection Date">
              <input
                type="date"
                className={inputClass}
                value={lastInspection}
                onChange={e => setLastInspection(e.target.value)}
              />
            </Field>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Latitude">
              <input
                type="number"
                className={`${inputClass} ${errors.lat ? 'border-red-500' : ''}`}
                value={lat}
                onChange={e => setLat(e.target.value)}
                placeholder="e.g. 5.1234567"
                step="any"
              />
              <p className="text-navy-600 text-xs mt-1">Decimal degrees, e.g. 5.1234567</p>
              {errors.lat && <p className="text-red-400 text-xs mt-1">{errors.lat}</p>}
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                className={`${inputClass} ${errors.lon ? 'border-red-500' : ''}`}
                value={lon}
                onChange={e => setLon(e.target.value)}
                placeholder="e.g. -59.1234567"
                step="any"
              />
              <p className="text-navy-600 text-xs mt-1">Decimal degrees, e.g. -59.1234567</p>
              {errors.lon && <p className="text-red-400 text-xs mt-1">{errors.lon}</p>}
            </Field>
          </div>


          <Field label="Airside Buildings">
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={airsideBuildings}
              onChange={e => setAirsideBuildings(e.target.value)}
              placeholder="Describe airside buildings, if any..."
              rows={2}
            />
          </Field>


          <Field label="Remarks">
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-navy-800 shrink-0">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !region}
            className="btn-gold px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Airstrip'}
          </button>
        </div>
      </div>
    </div>
  );
}
