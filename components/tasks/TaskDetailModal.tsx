'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  isMobile?: boolean;
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

// Auto-resize textarea for title
function AutoResizeTextarea({
  value,
  onChange,
  className,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, []);

  useEffect(() => { resize(); }, [value, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={2}
      className={className}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
      {...props}
    />
  );
}

export function TaskDetailModal({ task, isOpen, isMobile, onClose, onUpdate, onDelete, users }: TaskDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<TaskUpdate>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
        description: task.description || undefined,
      });
      setConfirmingDelete(false);
    }
  }, [task]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const focusable = modalRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [isOpen]);

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
    setDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const inputStyle: React.CSSProperties = isMobile ? { minHeight: 44, fontSize: 16 } : {};
  const buttonStyle: React.CSSProperties = isMobile ? { minHeight: 44, touchAction: 'manipulation' } : { touchAction: 'manipulation' };

  // --- Form fields (shared between desktop & mobile) ---
  const formContent = (
    <div className="space-y-3 md:space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Title</label>
        <AutoResizeTextarea
          value={formData.title || ''}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          aria-label="Title"
          className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors leading-snug"
          style={inputStyle}
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Status</label>
        <select
          value={formData.status || 'new'}
          onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskUpdate['status'] })}
          aria-label="Status"
          className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
          style={inputStyle}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Blocked Reason */}
      {formData.status === 'blocked' && (
        <div>
          <label className="block text-sm font-medium text-amber-400 mb-1.5">Blocked Reason</label>
          <input
            type="text"
            value={formData.blocked_reason || ''}
            onChange={(e) => setFormData({ ...formData, blocked_reason: e.target.value })}
            placeholder="What's blocking this task?"
            aria-label="Blocked reason"
            className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-amber-500/30 text-white placeholder-[#64748b] focus:outline-none focus:border-amber-500 transition-colors"
            style={inputStyle}
          />
        </div>
      )}

      {/* Due Date */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Due Date</label>
        <input
          type="date"
          value={formData.due_date || ''}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value || null })}
          aria-label="Due date"
          className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
          style={inputStyle}
        />
      </div>

      {/* Agency & Role */}
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Agency</label>
          <select
            value={formData.agency || ''}
            onChange={(e) => setFormData({ ...formData, agency: e.target.value || null })}
            aria-label="Agency"
            className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            style={inputStyle}
          >
            <option value="">None</option>
            {AGENCIES.map((agency) => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Role</label>
          <select
            value={formData.role || ''}
            onChange={(e) => setFormData({ ...formData, role: e.target.value || null })}
            aria-label="Role"
            className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white focus:outline-none focus:border-[#d4af37] transition-colors"
            style={inputStyle}
          >
            <option value="">None</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignee */}
      {task.owner_name && (
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Assigned To</label>
          <div className="px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm" style={inputStyle}>
            {task.owner_name}
          </div>
        </div>
      )}

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Priority</label>
        <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setFormData({ ...formData, priority: formData.priority === p.value ? null : p.value as Task['priority'] })}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                formData.priority === p.value
                  ? PRIORITY_ACTIVE_STYLES[p.value]
                  : 'bg-[#0a1628] text-[#64748b] border border-[#2d3a52] hover:border-[#3d4a62]'
              }`}
              style={buttonStyle}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value || undefined })}
          rows={3}
          placeholder="Add a description..."
          aria-label="Description"
          className="w-full px-3 py-2.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] transition-colors resize-none"
          style={{ ...inputStyle, minHeight: isMobile ? 80 : undefined }}
        />
      </div>
    </div>
  );

  // --- Footer (shared logic, different layout) ---
  const footerContent = confirmingDelete ? (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-white">Delete this task permanently?</p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmingDelete(false)}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
          style={buttonStyle}
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          style={buttonStyle}
        >
          {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
          Yes, permanently delete
        </button>
      </div>
    </div>
  ) : (
    <div className={`flex items-center ${isMobile ? 'flex-col gap-2' : 'justify-between'}`}>
      <button
        onClick={() => setConfirmingDelete(true)}
        disabled={deleting}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 ${
          isMobile ? 'w-full justify-center' : ''
        }`}
        style={buttonStyle}
      >
        <Trash2 className="h-4 w-4" />
        Delete Task
      </button>
      <div className={`flex gap-2 ${isMobile ? 'w-full' : ''}`}>
        <button
          onClick={onClose}
          className={`px-4 py-2.5 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors text-sm ${isMobile ? 'flex-1' : ''}`}
          style={buttonStyle}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d4af37] text-[#0a1628] font-medium hover:bg-[#c9a432] transition-colors disabled:opacity-50 text-sm ${isMobile ? 'flex-1' : ''}`}
          style={buttonStyle}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </div>
  );

  // === MOBILE: Full-screen bottom sheet ===
  if (isMobile) {
    return (
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-modal-mobile-title" className="fixed inset-0 z-50 flex flex-col bg-[#0a1628]">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3a52]">
          <h2 id="task-detail-modal-mobile-title" className="text-lg font-semibold text-white">Edit Task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-[#64748b] hover:text-white"
            style={{ minWidth: 44, minHeight: 44, touchAction: 'manipulation' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {formContent}
        </div>

        {/* Sticky footer */}
        <div className="px-4 py-3 border-t border-[#2d3a52]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {footerContent}
        </div>
      </div>
    );
  }

  // === DESKTOP: Centered modal ===
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="task-detail-modal-title" className="relative w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-[#2d3a52] shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up md:animate-fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-[#2d3a52]">
          <h2 id="task-detail-modal-title" className="text-lg font-semibold text-white">Edit Task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 md:p-4">
          {formContent}
        </div>

        {/* Footer */}
        <div className="p-3 md:p-4 border-t border-[#2d3a52]">
          {footerContent}
        </div>
      </div>
    </div>
  );
}
