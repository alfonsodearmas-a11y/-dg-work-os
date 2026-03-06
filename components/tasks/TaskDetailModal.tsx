'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import { Task, TaskUpdate } from '@/lib/task-types';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: TaskUpdate) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  users?: UserOption[];
}

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
] as const;

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'] as const;
const ROLES = ['Ministry', 'GWI Board', 'NCN Board', 'UG', 'City Council', 'Meeting Action Item'] as const;

const PRIORITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

const PRIORITY_ACTIVE_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/50',
  high: 'bg-amber-500/20 text-amber-400 border border-amber-500/50',
  medium: 'bg-blue-500/20 text-blue-400 border border-blue-500/50',
  low: 'bg-[#4a5568]/20 text-[#94a3b8] border border-[#4a5568]/50',
};

export function TaskDetailModal({ task, isOpen, onClose, onUpdate, onDelete, users }: TaskDetailModalProps) {
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
        priority: task.priority,
        blocked_reason: task.blocked_reason,
      });
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(task.id, formData);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Archive this task? It will be removed from the board.')) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
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
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
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
              value={formData.status || 'new'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskUpdate['status'] })}
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Blocked Reason (shown when status is blocked) */}
          {formData.status === 'blocked' && (
            <div>
              <label className="block text-sm font-medium text-amber-400 mb-1.5">
                Blocked Reason
              </label>
              <input
                type="text"
                value={formData.blocked_reason || ''}
                onChange={(e) => setFormData({ ...formData, blocked_reason: e.target.value })}
                placeholder="What's blocking this task?"
                className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-amber-500/30 text-white placeholder-[#64748b] focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          )}

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

          {/* Assignee (read-only display + info) */}
          {task.owner_name && (
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Assigned To
              </label>
              <div className="px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm">
                {task.owner_name}
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setFormData({ ...formData, priority: formData.priority === p.value ? null : p.value as Task['priority'] })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.priority === p.value
                      ? PRIORITY_ACTIVE_STYLES[p.value]
                      : 'bg-[#0a1628] text-[#64748b] border border-[#2d3a52] hover:border-[#3d4a62]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || undefined })}
              rows={3}
              placeholder="Add a description..."
              className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors resize-none"
            />
          </div>
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
