'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, MoreVertical, Search, Users, UserCheck, Clock, UserX, Send, Copy, KeyRound, ShieldOff, ShieldCheck, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { InviteUserModal } from '@/components/tasks/InviteUserModal';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  agency: string;
  is_active: boolean;
  status: string;
  displayStatus: 'invited' | 'active' | 'expired' | 'disabled';
  last_login: string | null;
  created_at: string;
  invite_sent_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  director: 'Director General',
  admin: 'Admin',
  ceo: 'Agency Head',
  supervisor: 'Supervisor',
  data_entry: 'Data Entry',
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' },
  invited: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Invited' },
  expired: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Expired' },
  disabled: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Disabled' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

type StatusFilter = 'all' | 'active' | 'invited' | 'expired' | 'disabled';

export default function PeoplePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Actions
  const resendInvite = async (userId: string) => {
    setOpenMenu(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/resend-invite`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.emailSent ? 'Invite resent' : 'Invite created but email failed. Use Copy Link.', data.emailSent ? 'success' : 'warning');
        fetchUsers();
      } else showToast(data.error, 'error');
    } catch { showToast('Failed to resend', 'error'); }
  };

  const copyInviteLink = async (userId: string) => {
    setOpenMenu(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/invite-link`);
      const data = await res.json();
      if (data.success) {
        await navigator.clipboard.writeText(data.url);
        showToast('Invite link copied');
      } else showToast(data.error, 'error');
    } catch { showToast('Failed to get link', 'error'); }
  };

  const resetPassword = async (userId: string) => {
    setOpenMenu(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.emailSent) {
          showToast('Password reset email sent');
        } else {
          await navigator.clipboard.writeText(data.resetUrl);
          showToast('Email failed. Reset link copied to clipboard.', 'warning');
        }
      } else showToast(data.error, 'error');
    } catch { showToast('Failed to reset', 'error'); }
  };

  const toggleStatus = async (userId: string, newStatus: 'active' | 'disabled') => {
    setOpenMenu(null);
    const action = newStatus === 'disabled' ? 'disable' : 're-enable';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) { showToast(`User ${newStatus === 'disabled' ? 'disabled' : 're-enabled'}`); fetchUsers(); }
      else showToast(data.error, 'error');
    } catch { showToast('Failed to update', 'error'); }
  };

  const deleteUser = async (userId: string, userName: string) => {
    setOpenMenu(null);
    if (!confirm(`Permanently delete ${userName}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (res.status === 204) { showToast('User deleted'); fetchUsers(); }
      else {
        const data = await res.json();
        showToast(data.error, 'error');
      }
    } catch { showToast('Failed to delete', 'error'); }
  };

  const revokeInvite = async (userId: string) => {
    setOpenMenu(null);
    if (!confirm('Revoke this invite? The user will need a new invitation.')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      });
      const data = await res.json();
      if (data.success) { showToast('Invite revoked'); fetchUsers(); }
      else showToast(data.error, 'error');
    } catch { showToast('Failed to revoke', 'error'); }
  };

  // Filter users
  const filtered = users.filter(u => {
    if (statusFilter !== 'all' && u.displayStatus !== statusFilter) return false;
    if (agencyFilter && u.agency !== agencyFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const stats = {
    total: users.length,
    active: users.filter(u => u.displayStatus === 'active').length,
    invited: users.filter(u => u.displayStatus === 'invited' || u.displayStatus === 'expired').length,
    disabled: users.filter(u => u.displayStatus === 'disabled').length,
  };

  const agencies = [...new Set(users.map(u => u.agency).filter(Boolean))].sort();

  // Current user id from cookie (approximated — DG row is the director role)
  const currentUserId = users.find(u => u.role === 'director')?.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">People</h1>
          <p className="text-sm text-[#64748b] mt-1">Manage users and invitations</p>
        </div>
        <button onClick={() => setInviteOpen(true)} className="btn-gold flex items-center gap-2 px-4 py-2.5 text-sm">
          <UserPlus className="h-4 w-4" /> Invite User
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-white' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-400' },
          { label: 'Pending Invites', value: stats.invited, icon: Clock, color: 'text-yellow-400' },
          { label: 'Disabled', value: stats.disabled, icon: UserX, color: 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="card-premium p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs text-[#64748b]">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 bg-[#1a2744]/50 rounded-lg p-0.5">
          {(['all', 'active', 'invited', 'expired', 'disabled'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-[#2d3a52] text-white' : 'text-[#64748b] hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Agency filter */}
        <select
          value={agencyFilter}
          onChange={e => setAgencyFilter(e.target.value)}
          className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
        >
          <option value="">All Agencies</option>
          {agencies.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748b]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-xs text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Agency</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Last Login</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isCurrentUser = u.id === currentUserId;
                  const badge = STATUS_BADGES[u.displayStatus] || STATUS_BADGES.active;

                  return (
                    <tr key={u.id} className={`border-b border-[#2d3a52]/50 hover:bg-[#2d3a52]/10 transition-colors ${isCurrentUser ? 'bg-[#d4af37]/5' : ''}`}>
                      <td className="px-4 py-3 text-white font-medium">
                        {u.full_name}
                        {isCurrentUser && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#d4af37]/20 text-[#d4af37] font-semibold">You</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{u.email}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#64748b]">{u.agency?.toUpperCase() || '\u2014'}</td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">{ROLE_LABELS[u.role] || u.role}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        {(u.displayStatus === 'invited' || u.displayStatus === 'expired') && u.invite_sent_at && (
                          <span className="block text-[10px] text-[#64748b] mt-0.5">
                            Invited {timeAgo(u.invite_sent_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        {!isCurrentUser && (
                          <div className="relative inline-block" ref={openMenu === u.id ? menuRef : undefined}>
                            <button
                              onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                              className="p-1.5 rounded-lg text-[#64748b] hover:text-white hover:bg-[#2d3a52]/50 transition-colors"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {openMenu === u.id && (
                              <div className="absolute right-0 top-full mt-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl z-10 w-48 py-1">
                                {/* Context-dependent actions */}
                                {(u.displayStatus === 'invited' || u.displayStatus === 'expired') && (
                                  <>
                                    <MenuButton icon={Send} label="Resend Invite" onClick={() => resendInvite(u.id)} />
                                    <MenuButton icon={Copy} label="Copy Invite Link" onClick={() => copyInviteLink(u.id)} />
                                    {u.displayStatus === 'invited' && (
                                      <MenuButton icon={ShieldOff} label="Revoke Invite" onClick={() => revokeInvite(u.id)} className="text-red-400" />
                                    )}
                                    {u.displayStatus === 'expired' && (
                                      <MenuButton icon={Trash2} label="Delete" onClick={() => deleteUser(u.id, u.full_name)} className="text-red-400" />
                                    )}
                                  </>
                                )}

                                {u.displayStatus === 'active' && (
                                  <>
                                    <MenuButton icon={KeyRound} label="Reset Password" onClick={() => resetPassword(u.id)} />
                                    <MenuButton icon={ShieldOff} label="Disable Account" onClick={() => toggleStatus(u.id, 'disabled')} className="text-red-400" />
                                  </>
                                )}

                                {u.displayStatus === 'disabled' && (
                                  <>
                                    <MenuButton icon={ShieldCheck} label="Re-enable Account" onClick={() => toggleStatus(u.id, 'active')} />
                                    <MenuButton icon={Trash2} label="Delete" onClick={() => deleteUser(u.id, u.full_name)} className="text-red-400" />
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[#64748b]">
                      {users.length === 0 ? 'No users yet. Invite your first team member.' : 'No users match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} onSuccess={fetchUsers} />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'warning' ? 'bg-yellow-600 text-white' :
          'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon: Icon, label, onClick, className = '' }: { icon: any; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[#2d3a52]/50 transition-colors ${className || 'text-[#94a3b8]'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
