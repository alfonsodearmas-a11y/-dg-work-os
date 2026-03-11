'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  Search, Users, UserCheck, UserX, UserPlus, Shield, ShieldOff,
  CheckCircle, AlertTriangle, X, Clock, Archive, ChevronDown,
  ArrowUpDown, Filter, Trash2, MoreHorizontal, Lock, Activity,
} from 'lucide-react';
import { UserDetailDrawer } from '@/components/admin/UserDetailDrawer';
import { PermissionsPanel } from '@/components/admin/PermissionsPanel';
import { AccessControlPanel } from '@/components/admin/AccessControlPanel';
import { ActivityLogPanel } from '@/components/admin/ActivityLogPanel';
import { usePermissions } from '@/hooks/usePeople';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, MINISTRY_ROLES } from '@/lib/people-types';

interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: string;
  formal_title: string | null;
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
type TopTab = 'directory' | 'permissions' | 'access' | 'activity';
type SortField = 'name' | 'role' | 'agency' | 'status' | 'last_seen';
type SortDir = 'asc' | 'desc';

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
  const [topTab, setTopTab] = useState<TopTab>('directory');

  // Permissions system
  const {
    permissions: myPermissions,
    roles: rolesData,
    allPermissions: allPermsData,
    hasPermission,
    loading: permsLoading,
  } = usePermissions();

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
          <p className="text-sm text-navy-600 mt-1">
            {stats.active} active · {stats.pending} pending · {stats.suspended > 0 ? `${stats.suspended} suspended · ` : ''}{stats.archived} archived
          </p>
        </div>
        {isDG && topTab === 'directory' && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors text-sm font-medium"
            aria-label="Invite User"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Invite User</span>
          </button>
        )}
      </div>

      {/* Top-level tabs */}
      <div className="flex items-center gap-1 border-b border-navy-800">
        {([
          { key: 'directory', label: 'Directory', icon: Users },
          { key: 'permissions', label: 'Permissions', icon: Shield },
          { key: 'access', label: 'Access Control', icon: Lock },
          { key: 'activity', label: 'Activity', icon: Activity },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTopTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              topTab === t.key ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'
            }`}
            aria-label={t.label}
          >
            <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Permission Matrix Tab */}
      {topTab === 'permissions' && (
        <PermissionsPanel
          roles={rolesData}
          allPermissions={allPermsData}
          myPermissions={myPermissions}
          myRole={session?.user?.role || 'officer'}
          loading={permsLoading}
        />
      )}

      {/* Access Control Tab */}
      {topTab === 'access' && (
        <AccessControlPanel
          members={users as any}
          myPermissions={myPermissions}
          loading={loading}
        />
      )}

      {/* Activity Log Tab */}
      {topTab === 'activity' && (
        <ActivityLogPanel hasPermission={hasPermission('audit.read')} />
      )}

      {/* Directory Tab */}
      {topTab !== 'directory' ? null : <>

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
              <span className="text-xs text-navy-600">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-navy-800">
        <button
          onClick={() => { setTab('active'); clearSelection(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'active' ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'
          }`}
        >
          Active Users ({activeUsers.length})
        </button>
        <button
          onClick={() => { setTab('archived'); clearSelection(); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'archived' ? 'border-gold-500 text-gold-500' : 'border-transparent text-navy-600 hover:text-white'
          }`}
        >
          Archived ({archivedUsers.length})
        </button>
      </div>

      {/* Toolbar: Search + Filters + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search users by name or email"
            className="w-full pl-10 pr-4 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
            hasActiveFilters ? 'border-gold-500/50 text-gold-500 bg-gold-500/10' : 'border-navy-800 text-slate-400 hover:text-white'
          }`}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
          {hasActiveFilters && (
            <span className="w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-xs flex items-center justify-center font-bold">
              {[filterRole, filterAgency, filterStatus].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => handleSort(sortField)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-navy-800 text-sm text-slate-400 hover:text-white transition-colors"
            aria-label="Sort"
          >
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{sortField === 'name' ? 'Name' : sortField === 'role' ? 'Role' : sortField === 'last_seen' ? 'Last Active' : sortField}</span>
            <span className="text-[10px]">{sortDir === 'asc' ? 'A-Z' : 'Z-A'}</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-navy-900 border border-navy-800">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            aria-label="Filter by role"
            className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={filterAgency}
            onChange={e => setFilterAgency(e.target.value)}
            aria-label="Filter by agency"
            className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">All Agencies</option>
            {AGENCY_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {tab === 'active' && (
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
              className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="">All Statuses</option>
              {FILTER_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 text-xs text-gold-500 hover:text-white transition-colors"
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
            <FilterPill label={`Role: ${ROLE_LABELS[filterRole as keyof typeof ROLE_LABELS] || filterRole}`} onRemove={() => setFilterRole('')} />
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
        <div className="flex items-center gap-3 p-3 rounded-lg bg-navy-900 border border-gold-500/30">
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
          <button onClick={clearSelection} className="p-1.5 rounded text-navy-600 hover:text-white transition-colors" aria-label="Clear selection">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="User directory">
              <thead>
                <tr className="border-b border-navy-800">
                  {isDG && (
                    <th scope="col" className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={sorted.length > 0 && selectedIds.size === sorted.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all users"
                        className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <SortHeader label="User" field="name" current={sortField} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Role" field="role" current={sortField} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Agency" field="agency" current={sortField} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortHeader label="Last Active" field="last_seen" current={sortField} dir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
                  <th scope="col" className="w-10 px-3 py-3" />
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
                      className={`border-b border-navy-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-gold-500/5' : 'hover:bg-navy-800/10'
                      } ${isSuspendedOrArchived ? 'opacity-50' : ''}`}
                    >
                      {isDG && (
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(u.id)}
                            aria-label={`Select ${u.name || u.email}`}
                            className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-navy-800 flex items-center justify-center text-xs font-bold text-navy-600 shrink-0">
                              {getInitial(u)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{u.name || 'No name'}</p>
                            <p className="text-navy-600 text-xs truncate">{u.email}</p>
                          </div>
                          {/* Mobile: inline role badge */}
                          <span className={`sm:hidden text-[10px] px-1.5 py-0.5 rounded shrink-0 ${ROLE_COLORS[u.role] || ROLE_COLORS.officer}`}>
                            {u.formal_title || ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded ${ROLE_COLORS[u.role] || ROLE_COLORS.officer}`}>
                          {u.formal_title || ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-navy-600">{u.agency?.toUpperCase() || '\u2014'}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[status] || STATUS_STYLES.active}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-navy-600">
                        {formatLastSeen(u)}
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDrawerUser(u)}
                          className="p-1.5 rounded text-navy-600 hover:text-white hover:bg-navy-800/50 transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={isDG ? 7 : 6} className="px-4 py-12 text-center text-navy-600">
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

      </>}

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
      scope="col"
      onClick={() => onSort(field)}
      className={`text-left px-4 py-3 text-xs font-semibold uppercase cursor-pointer select-none transition-colors ${
        active ? 'text-gold-500' : 'text-navy-600 hover:text-slate-400'
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
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/10 text-gold-500 text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors" aria-label="Remove filter">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface InviteModule {
  id: string;
  slug: string;
  name: string;
  default_roles: string[];
  is_active: boolean;
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
  const { data: session } = useSession();
  const isDG = session?.user?.role === 'dg';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('officer');
  const [agency, setAgency] = useState('');

  // DG can assign all roles; others only agency_admin and officer
  const availableRoles = isDG
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(r => !MINISTRY_ROLES.includes(r.value));

  const isMinistryRole = MINISTRY_ROLES.includes(role);
  const [submitting, setSubmitting] = useState(false);
  const [modules, setModules] = useState<InviteModule[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const inviteModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (inviteModalRef.current) {
      const focusable = inviteModalRef.current.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  // Fetch available modules
  useEffect(() => {
    fetch('/api/admin/modules')
      .then(r => r.json())
      .then(data => {
        if (data.modules) setModules(data.modules.filter((m: InviteModule) => m.is_active));
      })
      .catch(() => {});
  }, []);

  // When role changes, update selected modules to reflect defaults
  useEffect(() => {
    // Keep existing explicit selections, but remove any that are now defaults
    setSelectedModules(prev => {
      const next = new Set(prev);
      for (const m of modules) {
        if (m.default_roles.includes(role)) {
          next.delete(m.slug); // no need for explicit grant if default
        }
      }
      return next;
    });
  }, [role, modules]);

  const toggleModule = (slug: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

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
          moduleGrants: Array.from(selectedModules),
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

  // Modules that are NOT default for the selected role (candidates for explicit grants)
  const nonDefaultModules = modules.filter(m => !m.default_roles.includes(role));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" aria-hidden="true">
      <div ref={inviteModalRef} role="dialog" aria-modal="true" aria-labelledby="people-invite-modal-title" className="card-premium w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 id="people-invite-modal-title" className="text-lg font-bold text-white">Invite User</h2>
          <button onClick={onClose} className="p-1 rounded text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-navy-600">
          The user will appear as &quot;pending&quot; until they sign in with their Google account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-name" className="block text-xs text-slate-400 mb-1.5">Full Name</label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Smith"
              required
              aria-required="true"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="block text-xs text-slate-400 mb-1.5">Email (Google account)</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="john@agency.gov.gy"
              required
              aria-required="true"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-xs text-slate-400 mb-1.5">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={e => {
                setRole(e.target.value);
                // Clear agency when switching to a ministry role
                if (MINISTRY_ROLES.includes(e.target.value)) setAgency('');
              }}
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              {availableRoles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {isMinistryRole && (
              <p className="text-[10px] text-gold-500 mt-1">
                Ministry role — full access to all agencies and modules.
              </p>
            )}
          </div>

          {/* Agency (hidden for ministry roles) */}
          {!isMinistryRole && (
            <div>
              <label htmlFor="invite-agency" className="block text-xs text-slate-400 mb-1.5">Agency</label>
              <select
                id="invite-agency"
                value={agency}
                onChange={e => setAgency(e.target.value)}
                required={role === 'agency_admin'}
                aria-required={role === 'agency_admin' ? 'true' : undefined}
                className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
              >
                <option value="">
                  {role === 'agency_admin' ? 'Select agency (required)' : 'Select agency (optional)'}
                </option>
                {AGENCY_OPTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Module Access */}
          {nonDefaultModules.length > 0 && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Additional Module Access</label>
              <p className="text-[10px] text-navy-700 mb-2">
                This role already has default access to most modules. Grant additional access below:
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-navy-800 p-2 bg-navy-950">
                {nonDefaultModules.map(mod => (
                  <label
                    key={mod.slug}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      selectedModules.has(mod.slug) ? 'bg-gold-500/10' : 'hover:bg-navy-800/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.has(mod.slug)}
                      onChange={() => toggleModule(mod.slug)}
                      className="w-3.5 h-3.5 rounded border-navy-800 accent-gold-500 cursor-pointer"
                    />
                    <span className="text-xs text-white">{mod.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim() || !email.trim()}
            className="w-full py-2.5 rounded-lg bg-gold-500 text-navy-950 font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Adding...' : 'Add User'}
          </button>
        </form>
      </div>
    </div>
  );
}
