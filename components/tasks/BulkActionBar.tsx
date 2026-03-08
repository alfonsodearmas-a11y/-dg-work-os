'use client';

import { useState } from 'react';
import { X, Calendar, UserCircle, Building2, ArrowUpCircle, Trash2, Loader2 } from 'lucide-react';
import { TaskStatus } from '@/lib/task-types';

interface UserOption {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

interface BulkActionBarProps {
  count: number;
  isMobile: boolean;
  users: UserOption[];
  onClear: () => void;
  onBulkUpdate: (updates: Record<string, unknown>) => Promise<void>;
  onBulkDelete: () => void;
}

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Hinterland', 'Ministry'];
const STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: 'new', label: 'New', dot: 'bg-indigo-400' },
  { value: 'active', label: 'Active', dot: 'bg-blue-400' },
  { value: 'blocked', label: 'Blocked', dot: 'bg-amber-400' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-400' },
];

type ActivePopover = 'date' | 'assignee' | 'agency' | 'status' | 'delete' | null;

export function BulkActionBar({ count, isMobile, users, onClear, onBulkUpdate, onBulkDelete }: BulkActionBarProps) {
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [dateValue, setDateValue] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(false);

  if (count === 0) return null;

  const handleAction = async (updates: Record<string, unknown>) => {
    setLoading(true);
    try {
      await onBulkUpdate(updates);
      setActivePopover(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  const popoverBase = 'absolute bottom-full mb-2 rounded-xl bg-[#142238] border border-[#2d3a52] shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3 z-10';
  const popoverLeft = isMobile ? 'left-0 right-0 mx-4' : 'left-0 min-w-[240px]';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{ paddingBottom: isMobile ? 'max(0px, env(safe-area-inset-bottom))' : 0 }}
    >
      <div className="mx-auto max-w-4xl px-4 pb-3">
        <div className="relative rounded-xl bg-gradient-to-r from-[#1a2744] to-[#0f1d32] border border-[#d4af37]/30 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] px-4 py-3">
          {/* Top row: count + clear */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">
              <span className="text-[#d4af37]">{count}</span> task{count !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors"
              style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
              {!isMobile && 'Clear'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Due Date */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'date' ? null : 'date')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'date'
                    ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/50'
                    : 'bg-[#0a1628] text-[#94a3b8] border border-[#2d3a52] hover:border-[#3d4a62]'
                }`}
                style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Due Date"
              >
                <Calendar className="h-4 w-4" />
                {!isMobile && 'Due Date'}
              </button>
              {activePopover === 'date' && (
                <div className={`${popoverBase} ${popoverLeft}`}>
                  <label className="block text-xs text-[#94a3b8] mb-2">Set due date</label>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    aria-label="Due date"
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:outline-none focus:border-[#d4af37]"
                    style={{ minHeight: isMobile ? 44 : undefined }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleAction({ due_date: null })}
                      disabled={loading}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white bg-[#0a1628] border border-[#2d3a52] transition-colors"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      Clear date
                    </button>
                    <button
                      onClick={() => dateValue && handleAction({ due_date: dateValue })}
                      disabled={!dateValue || loading}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-[#0a1628] bg-[#d4af37] hover:bg-[#c9a432] disabled:opacity-50 transition-colors font-medium"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Apply'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Assignee */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'assignee' ? null : 'assignee')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'assignee'
                    ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/50'
                    : 'bg-[#0a1628] text-[#94a3b8] border border-[#2d3a52] hover:border-[#3d4a62]'
                }`}
                style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Assignee"
              >
                <UserCircle className="h-4 w-4" />
                {!isMobile && 'Assignee'}
              </button>
              {activePopover === 'assignee' && (
                <div className={`${popoverBase} ${popoverLeft}`} style={{ maxHeight: 300 }}>
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    aria-label="Search users"
                    className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:outline-none focus:border-[#d4af37] mb-2"
                    style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
                  />
                  <button
                    onClick={() => handleAction({ assignee_id: null })}
                    disabled={loading}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors mb-1"
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    Unassign
                  </button>
                  <div className="overflow-y-auto max-h-[180px] space-y-0.5">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAction({ assignee_id: u.id })}
                        disabled={loading}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        {u.name}
                        {u.agency && <span className="text-xs text-[#64748b] ml-1">({u.agency})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Agency */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'agency' ? null : 'agency')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'agency'
                    ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/50'
                    : 'bg-[#0a1628] text-[#94a3b8] border border-[#2d3a52] hover:border-[#3d4a62]'
                }`}
                style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Agency"
              >
                <Building2 className="h-4 w-4" />
                {!isMobile && 'Agency'}
              </button>
              {activePopover === 'agency' && (
                <div className={`${popoverBase} ${popoverLeft}`}>
                  <button
                    onClick={() => handleAction({ agency: null })}
                    disabled={loading}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-[#2d3a52] transition-colors mb-1"
                    style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                  >
                    Clear agency
                  </button>
                  <div className="space-y-0.5">
                    {AGENCIES.map((a) => (
                      <button
                        key={a}
                        onClick={() => handleAction({ agency: a })}
                        disabled={loading}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'status' ? null : 'status')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'status'
                    ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/50'
                    : 'bg-[#0a1628] text-[#94a3b8] border border-[#2d3a52] hover:border-[#3d4a62]'
                }`}
                style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Status"
              >
                <ArrowUpCircle className="h-4 w-4" />
                {!isMobile && 'Status'}
              </button>
              {activePopover === 'status' && (
                <div className={`${popoverBase} ${popoverLeft}`}>
                  <div className="space-y-0.5 mb-2">
                    {STATUSES.filter(s => s.value !== 'blocked').map((s) => (
                      <button
                        key={s.value}
                        onClick={() => handleAction({ status: s.value })}
                        disabled={loading}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-[#e2e8f0] hover:bg-[#2d3a52] transition-colors"
                        style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                      >
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-[#2d3a52] pt-2">
                    <label className="block text-xs text-amber-400 mb-1.5">Block with reason:</label>
                    <input
                      type="text"
                      value={blockedReason}
                      onChange={(e) => setBlockedReason(e.target.value)}
                      placeholder="Reason for blocking..."
                      aria-label="Reason for blocking"
                      className="w-full px-3 py-2 rounded-lg bg-[#0a1628] border border-amber-500/30 text-white text-sm placeholder-[#64748b] focus:outline-none focus:border-amber-500 mb-2"
                      style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
                    />
                    <button
                      onClick={() => handleAction({ status: 'blocked', blocked_reason: blockedReason || 'No reason provided' })}
                      disabled={loading}
                      className="w-full px-3 py-2 rounded-lg text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Block selected tasks'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="relative ml-auto">
              <button
                onClick={() => setActivePopover(activePopover === 'delete' ? null : 'delete')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'delete'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-[#0a1628] text-red-400 border border-red-500/30 hover:bg-red-500/10'
                }`}
                style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
                {!isMobile && 'Delete'}
              </button>
              {activePopover === 'delete' && (
                <div className={`${popoverBase} right-0 min-w-[220px]`} style={isMobile ? { left: 'auto', right: 0, marginLeft: 16, marginRight: 16 } : undefined}>
                  <p className="text-sm font-semibold text-white mb-1">
                    Delete {count} task{count !== 1 ? 's' : ''}?
                  </p>
                  <p className="text-xs text-[#64748b] mb-3">This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivePopover(null)}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white bg-[#0a1628] border border-[#2d3a52] transition-colors"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { onBulkDelete(); setActivePopover(null); }}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors font-medium"
                      style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
                    >
                      Yes, delete {count}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
