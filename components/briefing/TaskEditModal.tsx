'use client';

import { useState } from 'react';
import { X, Loader2, Calendar, Flag, Building2, CheckCircle } from 'lucide-react';

interface Task {
  notion_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  priority: string | null;
}

interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
  onSave: () => void;
}

const statuses = ['To do', 'In progress', 'Done'];
const priorities = ['High', 'Medium', 'Low'];
const agencies = ['GPL', 'GWI', 'HECI', 'MARAD', 'GCAA', 'CJIA', 'HAS', 'MOPUA'];

export function TaskEditModal({ task, onClose, onSave }: TaskEditModalProps) {
  const [dueDate, setDueDate] = useState(task.due_date || '');
  const [status, setStatus] = useState(task.status || 'To do');
  const [priority, setPriority] = useState(task.priority || '');
  const [agency, setAgency] = useState(task.agency || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.notion_id}`, {
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
      <div className="bg-[#0f1d32] border border-[#2d3a52] rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-md md:mx-4 overflow-hidden max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-[#2d3a52] bg-gradient-to-r from-[#1a2744] to-[#0f1d32]">
          <h2 className="text-lg font-semibold text-white">Edit Task</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 md:px-6 py-4 md:py-5 space-y-4 md:space-y-5">
          {/* Task Title (read-only) */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-2">
              Task
            </label>
            <p className="text-white bg-[#1a2744] p-4 rounded-xl border border-[#2d3a52]">
              {task.title}
            </p>
          </div>

          {/* Due Date */}
          <div>
            <label className="flex items-center text-sm font-medium text-[#94a3b8] mb-2">
              <Calendar className="h-4 w-4 mr-2 text-[#d4af37]" />
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors [color-scheme:dark]"
            />
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center text-sm font-medium text-[#94a3b8] mb-2">
              <CheckCircle className="h-4 w-4 mr-2 text-[#d4af37]" />
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              {statuses.map((s) => (
                <option key={s} value={s} className="bg-[#1a2744]">{s}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="flex items-center text-sm font-medium text-[#94a3b8] mb-2">
              <Flag className="h-4 w-4 mr-2 text-[#d4af37]" />
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              <option value="" className="bg-[#1a2744]">None</option>
              {priorities.map((p) => (
                <option key={p} value={p} className="bg-[#1a2744]">{p}</option>
              ))}
            </select>
          </div>

          {/* Agency */}
          <div>
            <label className="flex items-center text-sm font-medium text-[#94a3b8] mb-2">
              <Building2 className="h-4 w-4 mr-2 text-[#d4af37]" />
              Agency
            </label>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              <option value="" className="bg-[#1a2744]">None</option>
              {agencies.map((a) => (
                <option key={a} value={a} className="bg-[#1a2744]">{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 md:px-6 py-3 md:py-4 border-t border-[#2d3a52] bg-[#1a2744]/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-[#94a3b8] hover:text-white transition-colors rounded-xl hover:bg-[#2d3a52]"
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
