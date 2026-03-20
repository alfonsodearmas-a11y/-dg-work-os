'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Package, Upload, X as XIcon } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { METHOD_CONFIG, ProcurementMethod } from '@/lib/procurement-types';
import { fmtFileSize } from '@/lib/format';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';

// ── Types ─────────────────────────────────────────────────────────────────

interface ProcurementNewPackageFormProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const METHODS = Object.entries(METHOD_CONFIG) as [ProcurementMethod, { label: string }][];

// ── Component ─────────────────────────────────────────────────────────────

export function ProcurementNewPackageForm({
  isOpen,
  onClose,
  onCreated,
}: ProcurementNewPackageFormProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole = session?.user?.role;
  const userAgency = session?.user?.agency;
  const isDG = userRole === 'dg';

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [procurementMethod, setProcurementMethod] = useState<ProcurementMethod | ''>('');
  const [agency, setAgency] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Helpers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setProcurementMethod('');
    setAgency('');
    setExpectedDeliveryDate('');
    setNotes('');
    setFiles([]);
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!procurementMethod) {
      newErrors.procurementMethod = 'Procurement method is required';
    }

    if (isDG && !agency) {
      newErrors.agency = 'Agency is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── File handling ─────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected)]);
    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);

    try {
      // 1. Create the package
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          estimated_value: 0,
          procurement_method: procurementMethod,
          expected_delivery_date: expectedDeliveryDate || undefined,
          notes: notes.trim() || undefined,
          ...(isDG && { agency }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to create tender');
        setSubmitting(false);
        return;
      }

      const { package: created } = await res.json();
      const packageId = created?.id;

      // 2. Upload documents in parallel (if any)
      if (packageId && files.length > 0) {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const uploadRes = await fetch(
              `/api/procurement/${packageId}/documents`,
              { method: 'POST', body: formData }
            );
            if (!uploadRes.ok) throw new Error(file.name);
          })
        );

        const failedCount = results.filter((r) => r.status === 'rejected').length;

        if (failedCount > 0) {
          toast.warning(
            `Tender created but ${failedCount} document${failedCount > 1 ? 's' : ''} failed to upload`
          );
        } else {
          toast.success('Tender submitted');
        }
      } else {
        toast.success('Tender submitted');
      }

      onCreated();
      handleClose();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="New Procurement Tender"
      subtitle={isDG ? 'Director General' : userAgency?.toUpperCase()}
      icon={Package}
      accentColor="from-gold-600 to-gold-500"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="pkg-title" className="block text-xs text-slate-400 mb-1.5">
            Title *
          </label>
          <input
            id="pkg-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Supply of Distribution Transformers"
            required
            className="w-full px-3 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
          {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="pkg-desc" className="block text-xs text-slate-400 mb-1.5">
            Description
          </label>
          <textarea
            id="pkg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the procurement tender..."
            rows={3}
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
          />
        </div>

        {/* Procurement Method */}
        <div>
          <label htmlFor="pkg-method" className="block text-xs text-slate-400 mb-1.5">
            Procurement Method *
          </label>
          <select
            id="pkg-method"
            value={procurementMethod}
            onChange={(e) => setProcurementMethod(e.target.value as ProcurementMethod | '')}
            required
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">Select method</option>
            {METHODS.map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.procurementMethod && (
            <p className="text-xs text-red-400 mt-1">{errors.procurementMethod}</p>
          )}
        </div>

        {/* Agency (DG only — agency_admin auto-assigned) */}
        {isDG && (
          <div>
            <label htmlFor="pkg-agency" className="block text-xs text-slate-400 mb-1.5">
              Agency *
            </label>
            <select
              id="pkg-agency"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              required
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="">Select agency</option>
              {SELECTABLE_AGENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            {errors.agency && <p className="text-xs text-red-400 mt-1">{errors.agency}</p>}
          </div>
        )}

        {/* Expected Delivery Date */}
        <div>
          <label htmlFor="pkg-delivery" className="block text-xs text-slate-400 mb-1.5">
            Expected Delivery Date
          </label>
          <input
            id="pkg-delivery"
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="pkg-notes" className="block text-xs text-slate-400 mb-1.5">
            Notes
          </label>
          <textarea
            id="pkg-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes or context..."
            rows={3}
            className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
          />
        </div>

        {/* Supporting Documents */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            Supporting Documents
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.jpeg,.jpg,.png"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-navy-700 text-sm text-navy-600 hover:border-gold-500/50 hover:text-gold-500 transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span>Add Files</span>
          </button>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-navy-800 bg-navy-900/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-navy-600">{fmtFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-1 rounded hover:bg-navy-800 text-navy-600 hover:text-red-400 transition-colors shrink-0"
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit — sticky on mobile via SlidePanel's bottom padding */}
        <div className="sticky bottom-0 -mx-3 md:-mx-6 px-3 md:px-6 py-3 bg-navy-950/95 backdrop-blur-sm border-t border-navy-800 mt-4">
          <button
            type="submit"
            disabled={submitting || !title.trim() || !procurementMethod || (isDG && !agency)}
            className="w-full py-3 rounded-lg bg-gold-500 text-navy-950 font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: 48 }}
          >
            {submitting ? (
              <>
                <Spinner size="sm" className="border-navy-950 border-t-transparent" />
                Submitting...
              </>
            ) : (
              'Submit Tender'
            )}
          </button>
        </div>
      </form>
    </SlidePanel>
  );
}
