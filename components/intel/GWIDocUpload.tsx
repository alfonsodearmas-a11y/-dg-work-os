'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2, X,
  RefreshCw, Calendar,
} from 'lucide-react';

const API_BASE = '/api';

interface UploadZone {
  key: 'management' | 'cscr' | 'procurement';
  label: string;
  description: string;
  frequency: 'Monthly';
}

const UPLOAD_ZONES: UploadZone[] = [
  {
    key: 'management',
    label: 'Management Report',
    description: 'Financial performance, revenue, costs, balance sheet',
    frequency: 'Monthly',
  },
  {
    key: 'cscr',
    label: 'CSCR Board Report',
    description: 'Collections, billing, customer service, complaints',
    frequency: 'Monthly',
  },
  {
    key: 'procurement',
    label: 'Procurement Report',
    description: 'Purchases, contracts, inventory',
    frequency: 'Monthly',
  },
];

type UploadStage = 'idle' | 'uploading' | 'preview' | 'saving' | 'success' | 'error';

interface ZoneState {
  file: File | null;
  stage: UploadStage;
  preview: Record<string, unknown> | null;
  error: string | null;
}

interface GWIDocUploadProps {
  reportPeriod: string; // YYYY-MM
  onClose: () => void;
  onSaved?: () => void;
}

export function GWIDocUpload({ reportPeriod, onClose, onSaved }: GWIDocUploadProps) {
  const [zones, setZones] = useState<Record<string, ZoneState>>({
    management: { file: null, stage: 'idle', preview: null, error: null },
    cscr: { file: null, stage: 'idle', preview: null, error: null },
    procurement: { file: null, stage: 'idle', preview: null, error: null },
  });

  const updateZone = useCallback((key: string, updates: Partial<ZoneState>) => {
    setZones(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
  }, []);

  const handleFileDrop = useCallback((key: string, acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (!file.name.match(/\.docx$/i)) {
      updateZone(key, { error: 'Only .docx files are supported' });
      return;
    }
    updateZone(key, { file, stage: 'idle', error: null, preview: null });
  }, [updateZone]);

  const parseFile = async (key: string) => {
    const state = zones[key];
    if (!state.file) return;

    updateZone(key, { stage: 'uploading', error: null });

    try {
      const formData = new FormData();
      formData.append('file', state.file);
      formData.append('report_type', key);
      formData.append('report_period', `${reportPeriod}-01`);

      const res = await fetch(`${API_BASE}/gwi/upload/parse`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!result.success) {
        updateZone(key, { stage: 'error', error: result.error || 'Parse failed' });
        return;
      }

      updateZone(key, { stage: 'preview', preview: result.data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      updateZone(key, { stage: 'error', error: message });
    }
  };

  const confirmSave = async (key: string) => {
    const state = zones[key];
    if (!state.preview) return;

    updateZone(key, { stage: 'saving' });

    const extracted = (state.preview as Record<string, unknown>).extracted as Record<string, unknown>;

    try {
      // Build the save payload based on report type
      const saveBody: Record<string, unknown> = {
        report_month: `${reportPeriod}-01`,
        report_type: 'management',
      };

      if (key === 'management') {
        saveBody.financial_data = extracted;
      } else if (key === 'cscr') {
        const cscrData = extracted as { collections?: unknown; customerService?: unknown };
        saveBody.collections_data = cscrData.collections || extracted;
        saveBody.customer_service_data = cscrData.customerService || {};
      } else if (key === 'procurement') {
        saveBody.procurement_data = extracted;
      }

      const res = await fetch(`${API_BASE}/gwi/report/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody),
      });

      const result = await res.json();

      if (!result.success) {
        updateZone(key, { stage: 'error', error: result.error || 'Save failed' });
        return;
      }

      updateZone(key, { stage: 'success' });
      onSaved?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed';
      updateZone(key, { stage: 'error', error: message });
    }
  };

  const resetZone = (key: string) => {
    updateZone(key, { file: null, stage: 'idle', preview: null, error: null });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a1628] rounded-2xl border border-[#2d3a52] w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2d3a52]">
          <div>
            <h2 className="text-[22px] font-bold text-white">Upload GWI Reports</h2>
            <p className="text-[#64748b] text-sm mt-0.5">
              Upload .docx reports for {new Date(`${reportPeriod}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#2d3a52] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#94a3b8]" />
          </button>
        </div>

        {/* Upload Zones */}
        <div className="p-6 space-y-4">
          {UPLOAD_ZONES.map(zone => {
            const state = zones[zone.key];
            return (
              <DropZone
                key={zone.key}
                zone={zone}
                state={state}
                onDrop={(files) => handleFileDrop(zone.key, files)}
                onParse={() => parseFile(zone.key)}
                onConfirm={() => confirmSave(zone.key)}
                onReset={() => resetZone(zone.key)}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2d3a52] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#2d3a52] hover:bg-[#3d4a62] text-white rounded-lg text-[15px] font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DropZone Sub-component ──────────────────────────────────────────────────

interface DropZoneProps {
  zone: UploadZone;
  state: ZoneState;
  onDrop: (files: File[]) => void;
  onParse: () => void;
  onConfirm: () => void;
  onReset: () => void;
}

function DropZone({ zone, state, onDrop, onParse, onConfirm, onReset }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    maxFiles: 1,
    disabled: state.stage === 'uploading' || state.stage === 'saving',
  });

  return (
    <div className="bg-[#1a2744] rounded-xl border border-[#2d3a52] overflow-hidden">
      {/* Zone Header */}
      <div className="px-4 py-3 border-b border-[#2d3a52] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span className="text-[15px] font-semibold text-white">{zone.label}</span>
          <span className="text-xs px-2 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full">
            {zone.frequency}
          </span>
        </div>
        {state.stage === 'success' && (
          <span className="flex items-center gap-1 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" /> Saved
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Stage: idle / file selected */}
        {(state.stage === 'idle' || (!state.preview && state.stage !== 'uploading' && state.stage !== 'success')) && (
          <>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-cyan-400 bg-cyan-400/10' : 'border-[#2d3a52] hover:border-[#4d5a72]'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className={`w-6 h-6 mx-auto mb-2 ${isDragActive ? 'text-cyan-400' : 'text-[#64748b]'}`} />
              {state.file ? (
                <p className="text-white text-sm">{state.file.name}</p>
              ) : (
                <p className="text-[#94a3b8] text-sm">{zone.description}</p>
              )}
              <p className="text-[#64748b] text-xs mt-1">Drop .docx file or click to browse</p>
            </div>
            {state.file && (
              <button
                onClick={onParse}
                className="mt-3 w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Parse Document
              </button>
            )}
          </>
        )}

        {/* Stage: uploading */}
        {state.stage === 'uploading' && (
          <div className="flex items-center justify-center gap-3 py-6 text-[#94a3b8]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[15px]">Extracting data with Claude Sonnet...</span>
          </div>
        )}

        {/* Stage: preview */}
        {state.stage === 'preview' && state.preview && (
          <div className="space-y-3">
            <div className="bg-[#0a1628] rounded-lg p-3 border border-[#2d3a52] max-h-40 overflow-y-auto">
              <p className="text-xs text-[#64748b] mb-1">Extracted Data Preview</p>
              <pre className="text-xs text-[#94a3b8] whitespace-pre-wrap">
                {JSON.stringify((state.preview as Record<string, unknown>).extracted, null, 2)?.slice(0, 1000)}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onReset}
                className="flex-1 py-2.5 bg-[#2d3a52] hover:bg-[#3d4a62] text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm & Save
              </button>
            </div>
          </div>
        )}

        {/* Stage: saving */}
        {state.stage === 'saving' && (
          <div className="flex items-center justify-center gap-3 py-6 text-[#94a3b8]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[15px]">Saving data & generating AI insights...</span>
          </div>
        )}

        {/* Stage: success */}
        {state.stage === 'success' && (
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-[15px]">Data saved successfully</span>
            </div>
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Upload New
            </button>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="mt-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{state.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
