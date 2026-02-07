'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { Task, TaskUpdate } from '@/lib/notion';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: TaskUpdate) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

const STATUSES = ['To Do', 'In Progress', 'Waiting', 'Done'] as const;
const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Ministry'] as const;
const ROLES = ['Ministry', 'GWI Board', 'NCN Board', 'UG', 'City Council'] as const;
const PRIORITIES = ['High', 'Medium', 'Low'] as const;

export function TaskDetailModal({ task, isOpen, onClose, onUpdate, onDelete }: TaskDetailModalProps) {
  const [formData, setFormData] = useState<TaskUpdate>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        status: task.status,
        due_date: task.due_date,
        agency: task.agency,
        role: task.role,
        priority: task.priority
      });
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(task.notion_id, formData);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Archive this task? It will be removed from the board.')) return;
    setDeleting(true);
    try {
      await onDelete(task.notion_id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-[#2d3a52]">
          <h2 className="text-lg font-semibold text-white">Edit Task</h2>
          <div className="flex items-center gap-2">
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-[#64748b] hover:text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 md:p-4 space-y-3 md:space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Status
            </label>
            <select
              value={formData.status || 'To Do'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskUpdate['status'] })}
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              value={formData.due_date || ''}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value || null })}
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            />
          </div>

          {/* Agency & Role Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Agency
              </label>
              <select
                value={formData.agency || ''}
                onChange={(e) => setFormData({ ...formData, agency: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
              >
                <option value="">None</option>
                {AGENCIES.map((agency) => (
                  <option key={agency} value={agency}>{agency}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Role
              </label>
              <select
                value={formData.role || ''}
                onChange={(e) => setFormData({ ...formData, role: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
              >
                <option value="">None</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  onClick={() => setFormData({ ...formData, priority: formData.priority === priority ? null : priority })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.priority === priority
                      ? priority === 'High'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                        : priority === 'Medium'
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                        : 'bg-slate-500/20 text-slate-400 border border-slate-500/50'
                      : 'bg-[#0a1628] text-[#64748b] border border-[#2d3a52] hover:border-[#3d4a62]'
                  }`}
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee (read-only) */}
          {task.assignee && (
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Assignee
              </label>
              <div className="px-3 py-2 rounded-lg bg-[#0a1628]/50 border border-[#2d3a52] text-[#94a3b8]">
                {task.assignee}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 md:p-4 border-t border-[#2d3a52]">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Archive
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
