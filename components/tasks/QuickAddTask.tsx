'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Calendar } from 'lucide-react';
import { TaskStatus } from '@/lib/task-types';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface QuickAddTaskProps {
  status: TaskStatus;
  isMobile: boolean;
  users: UserOption[];
  onAdd: (data: { title: string; status: TaskStatus; priority: string; due_date?: string; assignee_id?: string }) => Promise<void>;
  onCancel: () => void;
}

const PRIORITIES = [
  { value: 'low', label: 'Low', dot: 'bg-[#64748b]' },
  { value: 'medium', label: 'Med', dot: 'bg-amber-500' },
  { value: 'high', label: 'High', dot: 'bg-red-400' },
  { value: 'critical', label: 'Crit', dot: 'bg-red-500' },
];

export function QuickAddTask({ status, isMobile, users, onAdd, onCancel }: QuickAddTaskProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await onAdd({
        title: title.trim(),
        status,
        priority,
        due_date: dueDate || undefined,
        assignee_id: assignee || undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  const inputStyle: React.CSSProperties = isMobile ? { minHeight: 44, fontSize: 16 } : {};

  return (
    <div className="rounded-xl border border-[#d4af37]/50 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] p-3 space-y-2">
      <input
        type="text"
        placeholder="Task title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        aria-label="Task title"
        aria-required="true"
        className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:outline-none focus:border-[#d4af37]"
        style={inputStyle}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Priority quick-set */}
        <div className="flex gap-1">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPriority(p.value)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                priority === p.value
                  ? 'bg-[#2d3a52] text-white'
                  : 'text-[#64748b] hover:text-[#94a3b8]'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
              {p.label}
            </button>
          ))}
        </div>

        {/* Due date */}
        <div className="relative">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="w-[120px] px-2 py-1 rounded text-xs bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] focus:outline-none focus:border-[#d4af37]"
            style={{ minHeight: isMobile ? 36 : undefined }}
          />
        </div>

        {/* Assignee (small select) */}
        {users.length > 0 && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Assignee"
            className="px-2 py-1 rounded text-xs bg-[#0a1628] border border-[#2d3a52] text-[#94a3b8] focus:outline-none focus:border-[#d4af37]"
            style={{ maxWidth: 120, minHeight: isMobile ? 36 : undefined }}
          >
            <option value="">Me</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || creating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-medium hover:bg-[#c9a432] disabled:opacity-50 transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
