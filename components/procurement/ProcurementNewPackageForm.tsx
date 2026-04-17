'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Package } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
  METHOD_CONFIG,
  TENDER_STAGES,
  STAGE_CONFIG,
  type TenderAgency,
  type TenderMethod,
  type TenderStage,
  AGENCY_CODES,
} from '@/lib/tender/types';

interface ProcurementNewPackageFormProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const METHODS = Object.entries(METHOD_CONFIG) as [TenderMethod, { label: string }][];

export function ProcurementNewPackageForm({ isOpen, onClose, onCreated }: ProcurementNewPackageFormProps) {
  const { data: session } = useSession();
  const { toast } = useToast();

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isMinistry = userRole === 'dg' || userRole === 'minister' || userRole === 'ps';

  const [description, setDescription] = useState('');
  const [agency, setAgency] = useState('');
  const [programmeCode, setProgrammeCode] = useState('');
  const [subProgrammeCode, setSubProgrammeCode] = useState('');
  const [programmeActivity, setProgrammeActivity] = useState('');
  const [stage, setStage] = useState<TenderStage>('design');
  const [method, setMethod] = useState<TenderMethod | ''>('');
  const [isRollover, setIsRollover] = useState(false);
  const [hasException, setHasException] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setDescription('');
    setAgency('');
    setProgrammeCode('');
    setSubProgrammeCode('');
    setProgrammeActivity('');
    setStage('design');
    setMethod('');
    setIsRollover(false);
    setHasException(false);
    setRemarks('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { toast.error('Description is required'); return; }
    if (isMinistry && !agency) { toast.error('Agency is required'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          agency: isMinistry ? agency : undefined,
          programme_code: programmeCode.trim() || undefined,
          sub_programme_code: subProgrammeCode.trim() || undefined,
          programme_activity: programmeActivity.trim() || undefined,
          stage,
          method: method || undefined,
          is_rollover: isRollover,
          has_exception: hasException,
          remarks: remarks.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to create tender');
        return;
      }
      toast.success('Tender created');
      onCreated();
      handleClose();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="New Tender (Manual)"
      subtitle="Creates a source='manual' tender outside the PSIP weekly ingest"
      icon={Package}
      accentColor="from-gold-600 to-gold-500"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Description <span className="text-red-400">*</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="e.g. Supply and delivery of transformers"
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
            required
          />
        </div>

        {isMinistry && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Agency <span className="text-red-400">*</span></label>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value as TenderAgency)}
              required
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="">Select agency</option>
              {AGENCY_CODES.map((c) => <option key={c} value={c}>{c === 'HINTERLAND_AIRSTRIPS' ? 'Hinterland Airstrips' : c}</option>)}
            </select>
          </div>
        )}
        {!isMinistry && userAgency && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Agency</label>
            <div className="text-sm text-white">{userAgency}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Programme code</label>
            <input
              value={programmeCode}
              onChange={(e) => setProgrammeCode(e.target.value)}
              placeholder="e.g. 342"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Sub-programme code</label>
            <input
              value={subProgrammeCode}
              onChange={(e) => setSubProgrammeCode(e.target.value)}
              placeholder="e.g. 2611300"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Programme activity</label>
          <input
            value={programmeActivity}
            onChange={(e) => setProgrammeActivity(e.target.value)}
            placeholder="Parent-row description this tender rolls up to"
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as TenderStage)}
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              {TENDER_STAGES.map((s) => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as TenderMethod | '')}
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="">(none)</option>
              {METHODS.map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={isRollover} onChange={(e) => setIsRollover(e.target.checked)} className="accent-gold-500" />
            Rollover from prior year
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={hasException} onChange={(e) => setHasException(e.target.checked)} className="accent-gold-500" />
            See remarks
          </label>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
          />
        </div>

        <div className="sticky bottom-0 -mx-3 md:-mx-6 px-3 md:px-6 py-3 bg-navy-950/95 backdrop-blur-sm border-t border-navy-800 mt-4">
          <button
            type="submit"
            disabled={submitting || !description.trim() || (isMinistry && !agency)}
            className="w-full py-3 rounded-lg bg-gold-500 text-navy-950 font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: 48 }}
          >
            {submitting ? <><Spinner size="sm" className="border-navy-950 border-t-transparent" />Submitting…</> : 'Create Tender'}
          </button>
        </div>
      </form>
    </SlidePanel>
  );
}
