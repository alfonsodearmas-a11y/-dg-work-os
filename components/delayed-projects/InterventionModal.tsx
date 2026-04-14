'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { INTERVENTION_TYPES, type InterventionType } from '@/lib/delayed-projects/types';

interface InterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  projectId: string;
  projectName: string;
}

export function InterventionModal({ isOpen, onClose, onCreated, projectId, projectName }: InterventionModalProps) {
  const { toast } = useToast();
  const [type, setType] = useState<InterventionType>('SITE_VISIT');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setType('SITE_VISIT');
    setDescription('');
    setAssignedTo('');
    setDueDate('');
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/delayed-projects/interventions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          intervention_type: type,
          description: description.trim(),
          assigned_to: assignedTo.trim() || null,
          due_date: dueDate || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create intervention');
      }

      toast.success('Intervention logged');
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create intervention';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy-900 border border-navy-800 rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Log Intervention</h2>
            <p className="text-xs text-navy-600">{projectName}</p>
          </div>
          <button onClick={onClose} className="text-navy-600 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs text-navy-600 mb-1.5">Intervention Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InterventionType)}
              className="input-premium w-full"
            >
              {INTERVENTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-navy-600 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-premium w-full resize-none"
              placeholder="What happened or what was decided..."
            />
          </div>

          {/* Assigned To + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-navy-600 mb-1.5">Assigned To</label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="input-premium w-full"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="block text-xs text-navy-600 mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-premium w-full"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="btn-gold px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Log Intervention
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
