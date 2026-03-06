'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  Search, Users, UserCheck, UserX, UserPlus, Shield, ShieldOff,
  CheckCircle, AlertTriangle, X, Clock, Archive, ChevronDown,
  ArrowUpDown, Filter, Trash2, MoreHorizontal,
} from 'lucide-react';
import { UserDetailDrawer } from '@/components/admin/UserDetailDrawer';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  agency: string | null;
  is_active: boolean;
  status: string | null;
  last_login: string | null;
  login_count: number | null;
  first_login_at: string | null;
  last_seen_at: string | null;
  invited_at: string | null;
  created_at: string;
  archived_at?: string | null;
}

type Tab = 'active' | 'archived';
type SortField = 'name' | 'role' | 'agency' | 'status' | 'last_seen';
type SortDir = 'asc' | 'desc';

const ROLE_LABELS: Record<string, string> = {
  dg: 'Director General',
  minister: 'Minister',
  ps: 'Permanent Secretary',
  agency_admin: 'Agency Admin',
  officer: 'Officer',
};

const ROLE_COLORS: Record<string, string> = {
  dg: 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30',
  minister: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  ps: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  agency_admin: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  officer: 'bg-[#4a5568]/20 text-[#94a3b8] border border-[#4a5568]/30',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  pending: 'bg-amber-500/20 text-amber-400',
  inactive: 'bg-gray-500/20 text-gray-400',
  suspended: 'bg-red-500/20 text-red-400',
  archived: 'bg-gray-500/20 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
  suspended: 'Suspended',
  archived: 'Archived',
};

const ROLE_OPTIONS = [
  { value: 'dg', label: 'Director General' },
  { value: 'minister', label: 'Minister' },
  { value: 'ps', label: 'Permanent Secretary' },
  { value: 'agency_admin', label: 'Agency Admin' },
  { value: 'officer', label: 'Officer' },
];

const INVITE_ROLE_OPTIONS = [
  { value: 'agency_admin', label: 'Agency Admin' },
  { value: 'officer', label: 'Officer' },
];

const AGENCY_OPTIONS = [
  { value: 'gpl', label: 'GPL' },
  { value: 'gwi', label: 'GWI' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gcaa', label: 'GCAA' },
  { value: 'heci', label: 'HECI' },
  { value: 'marad', label: 'MARAD' },
  { value: 'has', label: 'HAS' },
];

const FILTER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

export default function PeoplePage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<Tab>('active');

  // Filters
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterAgency, setFilterAgency] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  // Detail drawer
  const [drawerUser, setDrawerUser] = useState<User | null>(null);

  const isDG = session?.user?.role === 'dg';
  const currentUserId = session?.user?.id || '';

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Refresh drawer user after updates
  const handleUserUpdated = useCallback(() => {
    fetchUsers().then(() => {
      if (drawerUser) {
        // Will be updated on next render from users array
      }
    });
  }, [fetchUsers, drawerUser]);

  // Keep drawerUser in sync with users array
  useEffect(() => {
    if (drawerUser) {
      const updated = users.find(u => u.id === drawerUser.id);
      if (updated) setDrawerUser(updated);
      else setDrawerUser(null); // deleted
    }
  }, [users, drawerUser]);

  // Partition users by tab
  const { activeUsers, archivedUsers } = useMemo(() => {
    const active: User[] = [];
    const archived: User[] = [];
    for (const u of users) {
      if (u.status === 'archived') archived.push(u);
      else active.push(u);
    }
    return { activeUsers: active, archivedUsers: archived };
  }, [users]);

  const baseList = tab === 'archived' ? archivedUsers : activeUsers;

  // Apply filters and search
  const filtered = useMemo(() => {
    let list = baseList;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u =>
        (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    if (filterRole) list = list.filter(u => u.role === filterRole);
    if (filterAgency) list = list.filter(u => u.agency === filterAgency);
    if (filterStatus && tab === 'active') {
      list = list.filter(u => {
        const s = u.status || (u.is_active ? 'active' : 'inactive');
        return s === filterStatus;
      });
    }

    return list;
  }, [baseList, searchQuery, filterRole, filterAgency, filterStatus, tab]);

  // Apply sort
  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '');
          break;
        case 'role': {
          const order = ['dg', 'minister', 'ps', 'agency_admin', 'officer'];
          cmp = order.indexOf(a.role) - order.indexOf(b.role);
          break;
        }
        case 'agency':
          cmp = (a.agency || '').localeCompare(b.agency || '');
          break;
        case 'status': {
          const so = ['active', 'pending', 'inactive', 'suspended'];
          const sa = a.status || (a.is_active ? 'active' : 'inactive');
          const sb = b.status || (b.is_active ? 'active' : 'inactive');
          cmp = so.indexOf(sa) - so.indexOf(sb);
          break;
        }
        case 'last_seen': {
          const da = a.last_seen_at || a.last_login || '1970-01-01';
          const db = b.last_seen_at || b.last_login || '1970-01-01';
          cmp = da.localeCompare(db);
          break;
        }
      }
      return cmp * dir;
    });
    return list;
  }, [filtered, sortField, sortDir]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map(u => u.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk actions
  const executeBulkAction = async (action: string, payload?: Record<string, unknown>) => {
    const ids = Array.from(selectedIds).filter(id => id !== currentUserId);
    if (ids.length === 0) { showToast('No eligible users selected', 'error'); return; }

    const label = action === 'suspend' ? 'suspend' : action === 'archive' ? 'archive' : action === 'delete' ? 'permanently delete' : action;
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${ids.length} user(s)?`)) return;

    setBulkAction(action);
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: action === 'delete' ? 'DELETE' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'delete' ? { confirmEmail: users.find(u => u.id === id)?.email } : { action, ...payload }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    showToast(`${success} updated${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
    clearSelection();
    fetchUsers();
    setBulkAction(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const hasActiveFilters = !!filterRole || !!filterAgency || !!filterStatus;
  const clearFilters = () => { setFilterRole(''); setFilterAgency(''); setFilterStatus(''); };

  const stats = useMemo(() => ({
    total: activeUsers.length,
    active: activeUsers.filter(u => u.status === 'active' || (u.is_active && !u.status)).length,
    pending: activeUsers.filter(u => u.status === 'pending').length,
    suspended: activeUsers.filter(u => u.status === 'suspended').length,
    archived: archivedUsers.length,
  }), [activeUsers, archivedUsers]);

  const formatLastSeen = (u: User) => {
    const d = u.last_seen_at || u.last_login;
    if (!d) return u.status === 'pending' ? 'Never signed in' : 'Never';
    try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return 'Unknown'; }
  };

  const getInitial = (u: User) => (u.name || u.email)[0].toUpperCase();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">People</h1>
          <p className="text-sm text-[#64748b] mt-1">
            {stats.active} active · {stats.pending} pending · {stats.suspended > 0 ? `${stats.suspended} suspended · ` : ''}{stats.archived} archived
          </p>
        </div>
        {isDG && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-sm font-medium"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Invite User</span>
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: Users, color: 'text-white' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-400' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-400' },
          { label: 'Archived', value: stats.archived, icon: Archive, color: 'text-gray-400' },
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#2d3a52]">
        <button
          onClick={() => { setTab('active'); clearSelection(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'active' ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-[#64748b] hover:text-white'
          }`}
        >
          Active Users ({activeUsers.length})
        </button>
        <button
          onClick={() => { setTab('archived'); clearSelection(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'archived' ? 'border-[#d4af37] text-[#d4af37]' : 'border-transparent text-[#64748b] hover:text-white'
          }`}
        >
          Archived ({archivedUsers.length})
        </button>
      </div>

      {/* Toolbar: Search + Filters + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
            hasActiveFilters ? 'border-[#d4af37]/50 text-[#d4af37] bg-[#d4af37]/10' : 'border-[#2d3a52] text-[#94a3b8] hover:text-white'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-5 h-5 rounded-full bg-[#d4af37] text-[#0a1628] text-xs flex items-center justify-center font-bold">
              {[filterRole, filterAgency, filterStatus].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => handleSort(sortField)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#2d3a52] text-sm text-[#94a3b8] hover:text-white transition-colors"
          >
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">{sortField === 'name' ? 'Name' : sortField === 'role' ? 'Role' : sortField === 'last_seen' ? 'Last Active' : sortField}</span>
            <span className="text-[10px]">{sortDir === 'asc' ? 'A-Z' : 'Z-A'}</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-[#1a2744] border border-[#2d3a52]">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={filterAgency}
            onChange={e => setFilterAgency(e.target.value)}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Agencies</option>
            {AGENCY_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {tab === 'active' && (
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">All Statuses</option>
              {FILTER_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 text-xs text-[#d4af37] hover:text-white transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Filter Pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filterRole && (
            <FilterPill label={`Role: ${ROLE_LABELS[filterRole]}`} onRemove={() => setFilterRole('')} />
          )}
          {filterAgency && (
            <FilterPill label={`Agency: ${filterAgency.toUpperCase()}`} onRemove={() => setFilterAgency('')} />
          )}
          {filterStatus && (
            <FilterPill label={`Status: ${STATUS_LABELS[filterStatus]}`} onRemove={() => setFilterStatus('')} />
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && isDG && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[#1a2744] border border-[#d4af37]/30">
          <span className="text-sm text-white font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          {tab === 'active' && (
            <>
              <button
                onClick={() => executeBulkAction('suspend')}
                disabled={!!bulkAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                <ShieldOff className="h-3.5 w-3.5" />
                Suspend
              </button>
              <button
                onClick={() => executeBulkAction('archive')}
                disabled={!!bulkAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-500/10 transition-colors disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            </>
          )}
          {tab === 'archived' && (
            <button
              onClick={() => executeBulkAction('restore')}
              disabled={!!bulkAction}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Restore
            </button>
          )}
          <button
            onClick={() => executeBulkAction('delete')}
            disabled={!!bulkAction}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button onClick={clearSelection} className="p-1.5 rounded text-[#64748b] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
                  {isDG && (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={sorted.length > 0 && selectedIds.size === sorted.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-[#2d3a52] accent-[#d4af37] cursor-pointer"
                      />
                    </th>
                  )}
                  <SortHeader label="User" field="name" current={sortField} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Role" field="role" current={sortField} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Agency" field="agency" current={sortField} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Last Active" field="last_seen" current={sortField} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => {
                  const status = u.status || (u.is_active ? 'active' : 'inactive');
                  const isSelected = selectedIds.has(u.id);
                  const isSuspendedOrArchived = status === 'suspended' || status === 'archived';

                  return (
                    <tr
                      key={u.id}
                      onClick={() => setDrawerUser(u)}
                      className={`border-b border-[#2d3a52]/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#d4af37]/5' : 'hover:bg-[#2d3a52]/10'
                      } ${isSuspendedOrArchived ? 'opacity-50' : ''}`}
                    >
                      {isDG && (
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(u.id)}
                            className="w-4 h-4 rounded border-[#2d3a52] accent-[#d4af37] cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#2d3a52] flex items-center justify-center text-xs font-bold text-[#64748b] shrink-0">
                              {getInitial(u)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{u.name || 'No name'}</p>
                            <p className="text-[#64748b] text-xs truncate">{u.email}</p>
                          </div>
                          {/* Mobile: inline role badge */}
                          <span className={`sm:hidden text-[10px] px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[u.role] || ROLE_COLORS.officer}`}>
                            {u.role === 'agency_admin' ? 'Admin' : ROLE_LABELS[u.role] || u.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded ${ROLE_COLORS[u.role] || ROLE_COLORS.officer}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-[#64748b]">{u.agency?.toUpperCase() || '\u2014'}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[status] || STATUS_STYLES.active}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-[#64748b]">
                        {formatLastSeen(u)}
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDrawerUser(u)}
                          className="p-1.5 rounded text-[#64748b] hover:text-white hover:bg-[#2d3a52]/50 transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={isDG ? 7 : 6} className="px-4 py-12 text-center text-[#64748b]">
                      {baseList.length === 0
                        ? tab === 'archived' ? 'No archived users.' : 'No users yet.'
                        : 'No users match your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Detail Drawer */}
      <UserDetailDrawer
        user={drawerUser}
        isOpen={!!drawerUser}
        isDG={isDG}
        currentUserId={currentUserId}
        onClose={() => setDrawerUser(null)}
        onUserUpdated={handleUserUpdated}
        showToast={showToast}
      />

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => { showToast('User invited'); fetchUsers(); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

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

// --- Sub-components ---

function SortHeader({ label, field, current, dir, onSort, className = '' }: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = current === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`text-left px-4 py-3 text-xs font-semibold uppercase cursor-pointer select-none transition-colors ${
        active ? 'text-[#d4af37]' : 'text-[#64748b] hover:text-[#94a3b8]'
      } ${className}`}
    >
      <span className="flex items-center gap-1">
        {label}
        {active && <ChevronDown className={`h-3 w-3 transition-transform ${dir === 'asc' ? '' : 'rotate-180'}`} />}
      </span>
    </th>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d4af37]/10 text-[#d4af37] text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function InviteModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('officer');
  const [agency, setAgency] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          agency: agency || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        onError(data.error || 'Failed to invite user');
      }
    } catch {
      onError('Failed to invite user');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card-premium w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Invite User</h2>
          <button onClick={onClose} className="p-1 rounded text-[#64748b] hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-[#64748b]">
          The user will appear as &quot;pending&quot; until they sign in with their Google account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Smith"
              required
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Email (Google account)</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="john@agency.gov.gy"
              required
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            />
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              {INVITE_ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Agency</label>
            <select
              value={agency}
              onChange={e => setAgency(e.target.value)}
              required={role === 'agency_admin'}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
            >
              <option value="">
                {role === 'agency_admin' ? 'Select agency (required)' : 'Select agency (optional)'}
              </option>
              {AGENCY_OPTIONS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            className="w-full py-2.5 rounded-lg bg-[#d4af37] text-[#0a1628] font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Adding...' : 'Add User'}
          </button>
        </form>
      </div>
    </div>
  );
}
