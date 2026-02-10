'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Shield, ShieldOff, Mail, Clock } from 'lucide-react';
import { InviteUserModal } from '@/components/tasks/InviteUserModal';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  agency: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export default function PeoplePage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleActive = async (userId: string, currentlyActive: boolean) => {
    if (!confirm(currentlyActive ? 'Deactivate this user?' : 'Reactivate this user?')) return;

    if (currentlyActive) {
      await fetch(`/api/admin/users/${userId}/deactivate`, { method: 'POST' });
    } else {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
    }
    fetchUsers();
  };

  const ROLE_LABELS: Record<string, string> = {
    director: 'Director General',
    admin: 'Admin',
    ceo: 'Agency Head',
    supervisor: 'Supervisor',
    data_entry: 'Data Entry',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">People</h1>
          <p className="text-sm text-[#64748b] mt-1">Manage users and invite agency heads</p>
        </div>
        <button onClick={() => setInviteOpen(true)} className="btn-gold flex items-center gap-2 px-4 py-2.5 text-sm">
          <UserPlus className="h-4 w-4" /> Invite User
        </button>
      </div>

      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
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
              {users.map(u => (
                <tr key={u.id} className="border-b border-[#2d3a52]/50 hover:bg-[#2d3a52]/10 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-[#64748b]">{u.email}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#64748b]">{u.agency?.toUpperCase() || '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#64748b]">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748b]">
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Never'
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== 'director' && (
                      <button
                        onClick={() => toggleActive(u.id, u.is_active)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          u.is_active
                            ? 'text-red-400 hover:bg-red-500/10'
                            : 'text-green-400 hover:bg-green-500/10'
                        }`}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} onSuccess={fetchUsers} />
    </div>
  );
}
