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
  type Tender,
  type TenderAgency,
  type TenderMethod,
  type TenderStage,
  AGENCY_CODES,
} from '@/lib/tender/types';
import { LINE_ITEM_CODE_RE } from '@/lib/psip/parser';
import { MINISTRY_ROLES } from '@/lib/people-types';

interface ProcurementNewPackageFormProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tender: Tender) => void;
}

const METHODS = Object.entries(METHOD_CONFIG) as [TenderMethod, { label: string }][];

const inputClass =
  'w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50';
const errorInputClass =
  'w-full px-3 py-2 bg-navy-950 border border-red-500/60 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-red-500/60';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-red-400">{message}</p>;
}

export function ProcurementNewPackageForm({ isOpen, onClose, onCreated }: ProcurementNewPackageFormProps) {
  const { data: session } = useSession();
  const { toast } = useToast();

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isMinistry = MINISTRY_ROLES.includes(userRole ?? '');

  const [description, setDescription] = useState('');
  const [agency, setAgency] = useState('');
  const [stage, setStage] = useState<TenderStage>('design');
  const [method, setMethod] = useState<TenderMethod | ''>('');
  const [dateOfAward, setDateOfAward] = useState('');
  const [lineItemCode, setLineItemCode] = useState('');
  const [programmeCode, setProgrammeCode] = useState('');
  const [subProgrammeCode, setSubProgrammeCode] = useState('');
  const [programmeActivity, setProgrammeActivity] = useState('');
  const [dateAdvertised, setDateAdvertised] = useState('');
  const [dateClosed, setDateClosed] = useState('');
  const [dateEvalMtbRtb, setDateEvalMtbRtb] = useState('');
  const [dateEvalNptab, setDateEvalNptab] = useState('');
  const [contractor, setContractor] = useState('');
  const [implStart, setImplStart] = useState('');
  const [implEnd, setImplEnd] = useState('');
  const [implPct, setImplPct] = useState('');
  const [isRollover, setIsRollover] = useState(false);
  const [hasException, setHasException] = useState(false);
  const [remarks, setRemarks] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setDescription(''); setAgency(''); setStage('design'); setMethod(''); setDateOfAward('');
    setLineItemCode(''); setProgrammeCode(''); setSubProgrammeCode(''); setProgrammeActivity('');
    setDateAdvertised(''); setDateClosed(''); setDateEvalMtbRtb(''); setDateEvalNptab('');
    setContractor(''); setImplStart(''); setImplEnd(''); setImplPct('');
    setIsRollover(false); setHasException(false); setRemarks('');
    setErrors({});
  };

  const handleClose = () => { resetForm(); onClose(); };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required';
    if (isMinistry && !agency) e.agency = 'Agency is required';
    if (!stage) e.stage = 'Stage is required';
    if (!method) e.method = 'Procurement method is required';
    if (!dateOfAward) e.date_of_award = 'Expected award date is required';
    if (lineItemCode && !LINE_ITEM_CODE_RE.test(lineItemCode.trim())) {
      e.line_item_code = 'Must look like H-123, C-45, U-9, or PO-1234';
    }
    if (implPct !== '') {
      const n = Number(implPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        e.implementation_status_pct = 'Must be a number between 0 and 100';
      }
    }
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const payload = {
      description: description.trim(),
      agency: isMinistry ? agency : undefined,
      stage,
      method,
      date_of_award: dateOfAward,
      line_item_code: lineItemCode.trim() || undefined,
      programme_code: programmeCode.trim() || undefined,
      sub_programme_code: subProgrammeCode.trim() || undefined,
      programme_activity: programmeActivity.trim() || undefined,
      date_advertised: dateAdvertised || undefined,
      date_closed: dateClosed || undefined,
      date_eval_sent_mtb_rtb: dateEvalMtbRtb || undefined,
      date_eval_sent_nptab: dateEvalNptab || undefined,
      contractor: contractor.trim() || undefined,
      implementation_start_date: implStart || undefined,
      implementation_end_date: implEnd || undefined,
      implementation_status_pct: implPct !== '' ? Number(implPct) : undefined,
      is_rollover: isRollover,
      has_exception: hasException,
      remarks: remarks.trim() || undefined,
    };

    try {
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 422) {
        const data = await res.json().catch(() => ({}));
        setErrors(data.errors || {});
        toast.error('Please fix the highlighted fields');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to create tender');
        return;
      }
      const { tender } = await res.json() as { tender: Tender };
      toast.success('Tender created');
      onCreated(tender);
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
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-500/80">Core</h3>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description / Title <span className="text-red-400">*</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Supply and delivery of transformers"
              className={`${errors.description ? errorInputClass : inputClass} resize-none`}
              required
            />
            <FieldError message={errors.description} />
          </div>

          {isMinistry && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Agency <span className="text-red-400">*</span></label>
              <select
                value={agency}
                onChange={(e) => setAgency(e.target.value as TenderAgency)}
                required
                className={errors.agency ? errorInputClass : inputClass}
              >
                <option value="">Select agency</option>
                {AGENCY_CODES.map((c) => (
                  <option key={c} value={c}>{c === 'HINTERLAND_AIRSTRIPS' ? 'Hinterland Airstrips' : c}</option>
                ))}
              </select>
              <FieldError message={errors.agency} />
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
              <label className="block text-xs text-slate-400 mb-1.5">Stage / status <span className="text-red-400">*</span></label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as TenderStage)}
                className={errors.stage ? errorInputClass : inputClass}
              >
                {TENDER_STAGES.map((s) => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
              </select>
              <FieldError message={errors.stage} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Procurement method <span className="text-red-400">*</span></label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as TenderMethod | '')}
                className={errors.method ? errorInputClass : inputClass}
              >
                <option value="">Select method</option>
                {METHODS.map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <FieldError message={errors.method} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Expected award date <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={dateOfAward}
              onChange={(e) => setDateOfAward(e.target.value)}
              className={errors.date_of_award ? errorInputClass : inputClass}
              required
            />
            <FieldError message={errors.date_of_award} />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-500/80">Programme</h3>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Line item code</label>
            <input
              value={lineItemCode}
              onChange={(e) => setLineItemCode(e.target.value)}
              placeholder="e.g. H-123, C-45, PO-1234"
              className={errors.line_item_code ? errorInputClass : inputClass}
            />
            <FieldError message={errors.line_item_code} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Programme code</label>
              <input value={programmeCode} onChange={(e) => setProgrammeCode(e.target.value)} placeholder="e.g. 342" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Sub-programme code</label>
              <input value={subProgrammeCode} onChange={(e) => setSubProgrammeCode(e.target.value)} placeholder="e.g. 2611300" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Programme activity</label>
            <input
              value={programmeActivity}
              onChange={(e) => setProgrammeActivity(e.target.value)}
              placeholder="Parent-row description this tender rolls up to"
              className={inputClass}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-500/80">Timeline dates</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Date advertised</label>
              <input type="date" value={dateAdvertised} onChange={(e) => setDateAdvertised(e.target.value)} className={errors.date_advertised ? errorInputClass : inputClass} />
              <FieldError message={errors.date_advertised} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Date closed</label>
              <input type="date" value={dateClosed} onChange={(e) => setDateClosed(e.target.value)} className={errors.date_closed ? errorInputClass : inputClass} />
              <FieldError message={errors.date_closed} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Eval to MTB/RTB</label>
              <input type="date" value={dateEvalMtbRtb} onChange={(e) => setDateEvalMtbRtb(e.target.value)} className={errors.date_eval_sent_mtb_rtb ? errorInputClass : inputClass} />
              <FieldError message={errors.date_eval_sent_mtb_rtb} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Eval to NPTAB</label>
              <input type="date" value={dateEvalNptab} onChange={(e) => setDateEvalNptab(e.target.value)} className={errors.date_eval_sent_nptab ? errorInputClass : inputClass} />
              <FieldError message={errors.date_eval_sent_nptab} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-500/80">Implementation</h3>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Contractor</label>
            <input value={contractor} onChange={(e) => setContractor(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Implementation start</label>
              <input type="date" value={implStart} onChange={(e) => setImplStart(e.target.value)} className={errors.implementation_start_date ? errorInputClass : inputClass} />
              <FieldError message={errors.implementation_start_date} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Implementation end</label>
              <input type="date" value={implEnd} onChange={(e) => setImplEnd(e.target.value)} className={errors.implementation_end_date ? errorInputClass : inputClass} />
              <FieldError message={errors.implementation_end_date} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Implementation % complete</label>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={implPct}
              onChange={(e) => setImplPct(e.target.value)}
              placeholder="0–100"
              className={errors.implementation_status_pct ? errorInputClass : inputClass}
            />
            <FieldError message={errors.implementation_status_pct} />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gold-500/80">Flags &amp; remarks</h3>

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
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
          </div>
        </section>

        <div className="sticky bottom-0 -mx-3 md:-mx-6 px-3 md:px-6 py-3 bg-navy-950/95 backdrop-blur-sm border-t border-navy-800 mt-4">
          <button
            type="submit"
            disabled={submitting}
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
