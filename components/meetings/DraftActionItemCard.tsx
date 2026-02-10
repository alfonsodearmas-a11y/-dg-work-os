'use client';

import { useState } from 'react';
import {
  CheckCircle,
  X,
  Pencil,
  Save,
  Target,
  User,
  Clock,
  Building2,
  ExternalLink,
  Loader2,
  Ban,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface DraftActionItemData {
  id: string;
  recording_id: string;
  item_index: number;
  title: string;
  description: string | null;
  assigned_to: string | null;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  agency: string | null;
  review_status: string;
  reviewer_note: string | null;
  notion_task_id: string | null;
  push_error: string | null;
}

const PRIORITY_STYLES: Record<string, { variant: 'danger' | 'warning' | 'default'; label: string }> = {
  high: { variant: 'danger', label: 'High' },
  medium: { variant: 'warning', label: 'Medium' },
  low: { variant: 'default', label: 'Low' },
};

const REVIEW_STATUS_CONFIG: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'gold'; label: string }> = {
  pending: { variant: 'default', label: 'Pending Review' },
  approved: { variant: 'info', label: 'Approved' },
  rejected: { variant: 'danger', label: 'Rejected' },
  pushed_to_notion: { variant: 'success', label: 'Pushed to Notion' },
};

interface Props {
  item: DraftActionItemData;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onUpdate?: (updated: DraftActionItemData) => void;
}

export function DraftActionItemCard({ item, selected, onToggleSelect, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description || '');
  const [editAssignedTo, setEditAssignedTo] = useState(item.assigned_to || '');
  const [editDeadline, setEditDeadline] = useState(item.deadline || '');
  const [editPriority, setEditPriority] = useState(item.priority);
  const [editAgency, setEditAgency] = useState(item.agency || '');

  const prio = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium;
  const reviewCfg = REVIEW_STATUS_CONFIG[item.review_status] || REVIEW_STATUS_CONFIG.pending;
  const isPushed = item.review_status === 'pushed_to_notion';
  const isRejected = item.review_status === 'rejected';
  const isPending = item.review_status === 'pending';

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          assigned_to: editAssignedTo || null,
          deadline: editDeadline || null,
          priority: editPriority,
          agency: editAgency || null,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const { action_item } = await res.json();
      onUpdate?.(action_item);
      setEditing(false);
    } catch { /* stay in edit mode */ }
    setSaving(false);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/meetings/action-items/${item.id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Approve failed');
      const { action_item } = await res.json();
      onUpdate?.(action_item);
    } catch { /* silent */ }
    setApproving(false);
  }

  async function handleReject() {
    setRejecting(true);
    try {
      const res = await fetch(`/api/meetings/action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: 'rejected' }),
      });
      if (!res.ok) throw new Error('Reject failed');
      const { action_item } = await res.json();
      onUpdate?.(action_item);
    } catch { /* silent */ }
    setRejecting(false);
  }

  if (editing) {
    return (
      <div className="px-5 py-4 bg-[#1a2744]/50 space-y-3">
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Title</label>
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-[#64748b] mb-1">Description</label>
          <textarea
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            rows={2}
            className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none resize-y"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Assigned to</label>
            <input
              type="text"
              value={editAssignedTo}
              onChange={e => setEditAssignedTo(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Deadline</label>
            <input
              type="date"
              value={editDeadline}
              onChange={e => setEditDeadline(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Priority</label>
            <select
              value={editPriority}
              onChange={e => setEditPriority(e.target.value as 'high' | 'medium' | 'low')}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Agency</label>
            <select
              value={editAgency}
              onChange={e => setEditAgency(e.target.value)}
              className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">None</option>
              <option value="GPL">GPL</option>
              <option value="GWI">GWI</option>
              <option value="CJIA">CJIA</option>
              <option value="GCAA">GCAA</option>
              <option value="Ministry">Ministry</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={() => setEditing(false)} className="btn-navy text-xs px-3 py-1.5 flex items-center gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-gold text-xs px-3 py-1.5 flex items-center gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-5 py-4 hover:bg-[#1a2744]/30 transition-colors ${isRejected ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Selection checkbox for bulk approve */}
          {isPending && onToggleSelect && (
            <input
              type="checkbox"
              checked={selected || false}
              onChange={() => onToggleSelect(item.id)}
              className="shrink-0 accent-[#d4af37] w-4 h-4 rounded cursor-pointer"
            />
          )}
          {isPushed ? (
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : isRejected ? (
            <Ban className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <Target className="h-4 w-4 text-[#d4af37] shrink-0 mt-0.5" />
          )}
          <h3 className={`font-medium text-sm ${isRejected ? 'text-[#94a3b8] line-through' : 'text-white'}`}>
            {item.title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={reviewCfg.variant}>{reviewCfg.label}</Badge>
          <Badge variant={prio.variant}>{prio.label}</Badge>
        </div>
      </div>

      {item.description && (
        <p className="text-[#94a3b8] text-sm ml-6 mb-2">{item.description}</p>
      )}

      {item.push_error && (
        <p className="text-red-400/70 text-xs ml-6 mb-2">Push error: {item.push_error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 ml-6 text-xs text-[#64748b]">
        {item.assigned_to && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" /> {item.assigned_to}
          </span>
        )}
        {item.deadline && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {item.deadline}
          </span>
        )}
        {item.agency && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            <span className="text-[#d4af37]">{item.agency}</span>
          </span>
        )}
        {isPushed && item.notion_task_id && (
          <a
            href={`https://notion.so/${item.notion_task_id.replace(/-/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#d4af37] hover:text-[#e5c04b] transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" /> View Task
          </a>
        )}
      </div>

      {/* Action buttons for pending items */}
      {isPending && (
        <div className="flex items-center gap-2 ml-6 mt-3">
          <button
            onClick={handleApprove}
            disabled={approving}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors inline-flex items-center gap-1.5"
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={rejecting}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors inline-flex items-center gap-1.5"
          >
            {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            Reject
          </button>
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#2d3a52]/50 text-[#94a3b8] hover:bg-[#2d3a52] hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      )}
    </div>
  );
}
