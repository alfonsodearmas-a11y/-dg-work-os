'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Loader2, Calendar, Flag, Building2, CheckCircle } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  agency: string | null;
  priority: string | null;
}

interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
  onSave: () => void;
}

const statuses = [
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];
const priorities = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const agencies = ['GPL', 'GWI', 'HECI', 'MARAD', 'GCAA', 'CJIA', 'HAS', 'MOPUA'];

export function TaskEditModal({ task, onClose, onSave }: TaskEditModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [status, setStatus] = useState(task.status || 'new');
  const [priority, setPriority] = useState(task.priority || '');
  const [agency, setAgency] = useState(task.agency || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (modalRef.current) {
      const focusable = modalRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          due_date: dueDate || null,
          status,
          priority: priority || null,
          agency: agency || null
        })
      });

      if (!res.ok) throw new Error('Failed to save');
      onSave();
      onClose();
    } catch (error) {
      alert('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="task-edit-modal-title" className="bg-[#0f1d32] border border-navy-800 rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-md md:mx-4 overflow-hidden max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-navy-800 bg-gradient-to-r from-[#1a2744] to-[#0f1d32]">
          <h2 id="task-edit-modal-title" className="text-lg font-semibold text-white">Edit Task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4 md:space-y-5">
          {/* Task Title (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Task
            </label>
            <p className="text-white bg-navy-900 p-4 rounded-xl border border-navy-800">
              {task.title}
            </p>
          </div>

          {/* Due Date */}
          <div>
            <label className="flex items-center text-sm font-medium text-slate-400 mb-2">
              <Calendar className="h-4 w-4 mr-2 text-gold-500" />
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="w-full px-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center text-sm font-medium text-slate-400 mb-2">
              <CheckCircle className="h-4 w-4 mr-2 text-gold-500" />
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status"
              className="w-full px-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value} className="bg-navy-900">{s.label}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="flex items-center text-sm font-medium text-slate-400 mb-2">
              <Flag className="h-4 w-4 mr-2 text-gold-500" />
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Priority"
              className="w-full px-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              <option value="" className="bg-navy-900">None</option>
              {priorities.map((p) => (
                <option key={p.value} value={p.value} className="bg-navy-900">{p.label}</option>
              ))}
            </select>
          </div>

          {/* Agency */}
          <div>
            <label className="flex items-center text-sm font-medium text-slate-400 mb-2">
              <Building2 className="h-4 w-4 mr-2 text-gold-500" />
              Agency
            </label>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              aria-label="Agency"
              className="w-full px-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              <option value="" className="bg-navy-900">None</option>
              {agencies.map((a) => (
                <option key={a} value={a} className="bg-navy-900">{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 md:px-6 py-3 md:py-4 border-t border-navy-800 bg-navy-900/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-navy-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-gold px-5 py-2.5 text-sm font-medium flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
