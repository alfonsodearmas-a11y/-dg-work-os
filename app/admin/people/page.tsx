'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Users, UserCheck, UserX, Shield, ShieldOff, CheckCircle, AlertTriangle } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  agency: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  dg: 'Director General',
  minister: 'Minister',
  ps: 'Permanent Secretary',
  agency_admin: 'Agency Admin',
  officer: 'Officer',
};

const ROLE_OPTIONS = [
  { value: 'dg', label: 'Director General' },
  { value: 'minister', label: 'Minister' },
  { value: 'ps', label: 'Permanent Secretary' },
  { value: 'agency_admin', label: 'Agency Admin' },
  { value: 'officer', label: 'Officer' },
];

const AGENCY_OPTIONS = [
  { value: 'gpl', label: 'GPL' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gwi', label: 'GWI' },
  { value: 'gcaa', label: 'GCAA' },
];

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

export default function PeoplePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ role: string; agency: string | null }>({ role: '', agency: null });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleActive = async (userId: string, currentlyActive: boolean) => {
    if (!confirm(`Are you sure you want to ${currentlyActive ? 'deactivate' : 'reactivate'} this user?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      const data = await res.json();
      if (res.ok) { showToast(`User ${currentlyActive ? 'deactivated' : 'reactivated'}`); fetchUsers(); }
      else showToast(data.error, 'error');
    } catch { showToast('Failed to update', 'error'); }
  };

  const startEditing = (user: User) => {
    setEditingUser(user.id);
    setEditForm({ role: user.role, agency: user.agency });
  };

  const saveRole = async (userId: string) => {
    try {
      const payload: Record<string, unknown> = { role: editForm.role };
      if (MINISTRY_ROLES.includes(editForm.role)) {
        payload.agency = null;
      } else {
        payload.agency = editForm.agency;
      }

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('User updated');
        setEditingUser(null);
        fetchUsers();
      } else showToast(data.error, 'error');
    } catch { showToast('Failed to update', 'error'); }
  };

  const filtered = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">People</h1>
        <p className="text-sm text-[#64748b] mt-1">Manage user roles and access. Users are created automatically on first Google sign-in.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-white' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-400' },
          { label: 'Inactive', value: stats.inactive, icon: UserX, color: 'text-gray-400' },
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-10 pr-4 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
        />
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Agency</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Last Login</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isEditing = editingUser === u.id;

                  return (
                    <tr key={u.id} className="border-b border-[#2d3a52]/50 hover:bg-[#2d3a52]/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#2d3a52] flex items-center justify-center text-xs font-bold text-[#64748b]">
                              {(u.name || u.email)[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium">{u.name || 'No name'}</p>
                            <p className="text-[#64748b] text-xs">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editForm.role}
                            onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                            className="px-2 py-1 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white"
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-[#94a3b8]">{ROLE_LABELS[u.role] || u.role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing && !MINISTRY_ROLES.includes(editForm.role) ? (
                          <select
                            value={editForm.agency || ''}
                            onChange={e => setEditForm({ ...editForm, agency: e.target.value || null })}
                            className="px-2 py-1 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white"
                          >
                            <option value="">Select agency</option>
                            {AGENCY_OPTIONS.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-[#64748b]">{u.agency?.toUpperCase() || '\u2014'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveRole(u.id)}
                                className="px-2.5 py-1 text-xs rounded bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingUser(null)}
                                className="px-2.5 py-1 text-xs rounded text-[#64748b] hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditing(u)}
                                className="p-1.5 rounded text-[#64748b] hover:text-[#d4af37] hover:bg-[#2d3a52]/50 transition-colors"
                                title="Edit role"
                              >
                                <Shield className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => toggleActive(u.id, u.is_active)}
                                className={`p-1.5 rounded transition-colors ${u.is_active ? 'text-[#64748b] hover:text-red-400 hover:bg-red-500/10' : 'text-[#64748b] hover:text-green-400 hover:bg-green-500/10'}`}
                                title={u.is_active ? 'Deactivate' : 'Reactivate'}
                              >
                                <ShieldOff className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[#64748b]">
                      {users.length === 0 ? 'No users yet. Users are created when they sign in with Google.' : 'No users match your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
