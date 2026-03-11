'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Shield, ShieldOff, Archive, RotateCcw, LogOut, Trash2,
  ChevronDown, AlertTriangle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { UserProfileSection } from './UserProfileSection';
import { UserRolesSection, ModuleAccessSection } from './UserRolesSection';
import { UserActivitySection } from './UserActivitySection';
import type { ModuleInfo } from './UserRolesSection';
import type { AuditEntry } from './UserActivitySection';
import { UserCheck, UserX, Clock } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/people-types';

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

interface UserDetailDrawerProps {
  user: User | null;
  isOpen: boolean;
  isDG: boolean;
  currentUserId: string;
  onClose: () => void;
  onUserUpdated: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const STATUS_STYLES: Record<string, { bg: string; label: string; icon: typeof UserCheck }> = {
  active: { bg: 'bg-green-500/20 text-green-400', label: 'Active', icon: UserCheck },
  pending: { bg: 'bg-amber-500/20 text-amber-400', label: 'Pending', icon: Clock },
  inactive: { bg: 'bg-gray-500/20 text-gray-400', label: 'Inactive', icon: UserX },
  suspended: { bg: 'bg-red-500/20 text-red-400', label: 'Suspended', icon: ShieldOff },
  archived: { bg: 'bg-gray-500/20 text-gray-500', label: 'Archived', icon: Archive },
};

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

export function UserDetailDrawer({ user, isOpen, isDG, currentUserId, onClose, onUserUpdated, showToast }: UserDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [editRole, setEditRole] = useState('');
  const [editAgency, setEditAgency] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('profile');

  // Module access state
  const [allModules, setAllModules] = useState<ModuleInfo[]>([]);
  const [userModuleGrants, setUserModuleGrants] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [moduleToggling, setModuleToggling] = useState<string | null>(null);

  const isSelf = user?.id === currentUserId;
  const status = user?.status || (user?.is_active ? 'active' : 'inactive');

  // Derive dirty flag from comparing edit values to user prop
  const dirty = user
    ? editRole !== user.role ||
      editAgency !== user.agency ||
      editName !== (user.name || '')
    : false;

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      setEditRole(user.role);
      setEditAgency(user.agency);
      setEditName(user.name || '');
      setShowDeleteConfirm(false);
      setDeleteConfirmEmail('');
      setExpandedSection('profile');
    }
  }, [user]);

  // Fetch modules + user grants
  const fetchModuleAccess = useCallback(async () => {
    if (!user || !isDG) return;
    setModulesLoading(true);
    try {
      const [modulesRes, grantsRes] = await Promise.all([
        fetch('/api/admin/modules'),
        fetch(`/api/admin/modules/access?userId=${user.id}`),
      ]);
      if (modulesRes.ok) {
        const data = await modulesRes.json();
        setAllModules(data.modules || []);
      }
      if (grantsRes.ok) {
        const data = await grantsRes.json();
        setUserModuleGrants(data.grants || []);
      }
    } catch {}
    setModulesLoading(false);
  }, [user, isDG]);

  useEffect(() => {
    if (isOpen && user && isDG) fetchModuleAccess();
  }, [isOpen, user, isDG, fetchModuleAccess]);

  const toggleModuleAccess = async (moduleSlug: string, currentlyHasAccess: boolean) => {
    if (!user) return;
    setModuleToggling(moduleSlug);
    try {
      const res = await fetch('/api/admin/modules/access', {
        method: currentlyHasAccess ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, moduleSlug }),
      });
      if (res.ok) {
        if (currentlyHasAccess) {
          setUserModuleGrants(prev => prev.filter(s => s !== moduleSlug));
        } else {
          setUserModuleGrants(prev => [...prev, moduleSlug]);
        }
        showToast(
          currentlyHasAccess ? `Revoked access to ${moduleSlug}` : `Granted access to ${moduleSlug}`,
          'success'
        );
      } else {
        showToast('Failed to update module access', 'error');
      }
    } catch {
      showToast('Failed to update module access', 'error');
    }
    setModuleToggling(null);
  };

  // Fetch audit log
  const fetchAudit = useCallback(async () => {
    if (!user) return;
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/audit`);
      const data = await res.json();
      if (data.entries) setAudit(data.entries);
    } catch {}
    setLoadingAudit(false);
  }, [user]);

  useEffect(() => {
    if (isOpen && user) fetchAudit();
  }, [isOpen, user, fetchAudit]);

  // Escape to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;
    const focusable = drawerRef.current.querySelector<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [isOpen]);

  const handleFieldChange = (field: string, value: string | null) => {
    if (field === 'role') {
      setEditRole(value || '');
      if (MINISTRY_ROLES.includes(value || '')) setEditAgency(null);
    } else if (field === 'agency') {
      setEditAgency(value);
    } else if (field === 'name') {
      setEditName(value || '');
    }
  };

  const saveChanges = async () => {
    if (!user || !dirty) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editRole !== user.role) payload.role = editRole;
      if (editAgency !== user.agency) payload.agency = MINISTRY_ROLES.includes(editRole) ? null : editAgency;
      if (editName !== (user.name || '')) payload.name = editName;

      if (Object.keys(payload).length === 0) { setSaving(false); return; }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('User updated', 'success');
        onUserUpdated();
        fetchAudit();
      } else {
        showToast(data.error || 'Failed to update', 'error');
      }
    } catch {
      showToast('Failed to update', 'error');
    }
    setSaving(false);
  };

  const performAction = async (action: string, confirmMsg: string) => {
    if (!user || isSelf) return;
    if (!confirm(confirmMsg)) return;
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Action completed', 'success');
        onUserUpdated();
        fetchAudit();
      } else {
        showToast(data.error || 'Action failed', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    }
    setActionLoading(null);
  };

  const handleDelete = async () => {
    if (!user) return;
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteConfirmEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('User permanently deleted', 'success');
        onClose();
        onUserUpdated();
      } else {
        showToast(data.error || 'Delete failed', 'error');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
    setActionLoading(null);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  if (!user) return null;

  const statusInfo = STATUS_STYLES[status] || STATUS_STYLES.active;
  const StatusIcon = statusInfo.icon;

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[46] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-detail-drawer-title"
        className={`fixed inset-y-0 right-0 w-full sm:w-[440px] bg-navy-950 border-l border-navy-800 z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-navy-800 px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 id="user-detail-drawer-title" className="text-lg font-bold text-white">User Details</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* User Header Card */}
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-navy-800 flex items-center justify-center text-sm font-bold text-slate-400">
                {getInitials(user.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{user.name || 'No name'}</p>
              <p className={`text-xs font-medium truncate ${ROLE_COLORS[user.role]?.includes('text-') ? ROLE_COLORS[user.role].split(' ').find(c => c.startsWith('text-'))! : 'text-gold-500'}`}>
                {user.formal_title || ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
              </p>
              <p className="text-navy-600 text-xs truncate">{user.email}</p>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.bg}`}>
              <StatusIcon className="h-3 w-3" />
              {statusInfo.label}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-24 sm:pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>

          {/* Profile Info Section */}
          <Section title="Profile Info" id="profile" expanded={expandedSection === 'profile'} onToggle={() => toggleSection('profile')}>
            <UserProfileSection
              user={user}
              isDG={isDG}
              isSelf={isSelf}
              status={status}
              editName={editName}
              actionLoading={actionLoading}
              onFieldChange={handleFieldChange}
              onAction={performAction}
            />
          </Section>

          {/* Role & Permissions */}
          <Section title="Role & Permissions" id="role" expanded={expandedSection === 'role'} onToggle={() => toggleSection('role')}>
            <UserRolesSection
              user={user}
              isDG={isDG}
              isSelf={isSelf}
              editRole={editRole}
              editAgency={editAgency}
              onFieldChange={handleFieldChange}
            />
          </Section>

          {/* Module Access Section (DG only, not self, skip ministry roles who have full access) */}
          {isDG && !isSelf && !['dg', 'minister', 'ps'].includes(user.role) && (
            <Section title="Module Access" id="modules" expanded={expandedSection === 'modules'} onToggle={() => toggleSection('modules')}>
              <ModuleAccessSection
                user={user}
                allModules={allModules}
                userModuleGrants={userModuleGrants}
                modulesLoading={modulesLoading}
                moduleToggling={moduleToggling}
                onToggleModuleAccess={toggleModuleAccess}
              />
            </Section>
          )}

          {/* Security Section (DG only, not self) */}
          {isDG && !isSelf && (
            <Section title="Security" id="security" expanded={expandedSection === 'security'} onToggle={() => toggleSection('security')}>
              <SecuritySection
                user={user}
                status={status}
                actionLoading={actionLoading}
                showDeleteConfirm={showDeleteConfirm}
                deleteConfirmEmail={deleteConfirmEmail}
                onAction={performAction}
                onDelete={handleDelete}
                onShowDeleteConfirm={setShowDeleteConfirm}
                onDeleteConfirmEmailChange={setDeleteConfirmEmail}
              />
            </Section>
          )}

          {/* Activity Log */}
          <Section title="Activity Log" id="activity" expanded={expandedSection === 'activity'} onToggle={() => toggleSection('activity')}>
            <UserActivitySection
              audit={audit}
              loadingAudit={loadingAudit}
            />
          </Section>
        </div>

        {/* Save Bar (sticky at bottom when dirty) */}
        {dirty && isDG && (
          <div className="flex-shrink-0 border-t border-navy-800 bg-navy-900 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">Unsaved changes</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (user) {
                    setEditRole(user.role);
                    setEditAgency(user.agency);
                    setEditName(user.name || '');
                  }
                }}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-[#e5c348] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// --- Sub-components kept in this file ---

function Section({ title, id, expanded, onToggle, children }: {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-navy-800">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-navy-800/20 transition-colors"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <ChevronDown className={`h-4 w-4 text-navy-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-5 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function SecuritySection({ user, status, actionLoading, showDeleteConfirm, deleteConfirmEmail, onAction, onDelete, onShowDeleteConfirm, onDeleteConfirmEmailChange }: {
  user: { id: string; email: string };
  status: string;
  actionLoading: string | null;
  showDeleteConfirm: boolean;
  deleteConfirmEmail: string;
  onAction: (action: string, confirmMsg: string) => void;
  onDelete: () => void;
  onShowDeleteConfirm: (show: boolean) => void;
  onDeleteConfirmEmailChange: (email: string) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Suspend / Reactivate */}
      {status === 'suspended' ? (
        <ActionButton
          icon={RotateCcw}
          label="Reactivate User"
          desc="Restore access for this user"
          color="text-green-400 hover:bg-green-500/10"
          loading={actionLoading === 'reactivate'}
          onClick={() => onAction('reactivate', 'Reactivate this user? They will regain access.')}
        />
      ) : status !== 'archived' ? (
        <ActionButton
          icon={ShieldOff}
          label="Suspend User"
          desc="Immediately revoke access"
          color="text-amber-400 hover:bg-amber-500/10"
          loading={actionLoading === 'suspend'}
          onClick={() => onAction('suspend', 'Suspend this user? They will lose access immediately.')}
        />
      ) : null}

      {/* Archive / Restore */}
      {status === 'archived' ? (
        <ActionButton
          icon={RotateCcw}
          label="Restore User"
          desc="Move back to active users"
          color="text-blue-400 hover:bg-blue-500/10"
          loading={actionLoading === 'restore'}
          onClick={() => onAction('restore', 'Restore this archived user?')}
        />
      ) : status !== 'archived' ? (
        <ActionButton
          icon={Archive}
          label="Archive User"
          desc="Move to archived — can be restored later"
          color="text-gray-400 hover:bg-gray-500/10"
          loading={actionLoading === 'archive'}
          onClick={() => onAction('archive', 'Archive this user? They will be moved to the archived tab.')}
        />
      ) : null}

      {/* Force Sign Out */}
      <ActionButton
        icon={LogOut}
        label="Force Sign Out"
        desc="End all active sessions"
        color="text-orange-400 hover:bg-orange-500/10"
        loading={actionLoading === 'force_signout'}
        onClick={() => onAction('force_signout', 'Force sign out this user?')}
      />

      {/* Permanent Delete */}
      <div className="mt-4 pt-4 border-t border-navy-800">
        <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Danger Zone
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => onShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="font-medium">Permanently Delete</p>
              <p className="text-xs text-red-400/60">This cannot be undone</p>
            </div>
          </button>
        ) : (
          <div className="space-y-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
            <p className="text-xs text-red-400">
              Type <span className="font-mono font-bold">{user.email}</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={e => onDeleteConfirmEmailChange(e.target.value)}
              placeholder={user.email}
              aria-label="Type email to confirm deletion"
              aria-required="true"
              className="w-full px-3 py-1.5 bg-navy-950 border border-red-500/30 rounded text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
            />
            <div className="flex gap-2">
              <button
                onClick={onDelete}
                disabled={deleteConfirmEmail !== user.email || actionLoading === 'delete'}
                className="flex-1 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === 'delete' ? 'Deleting...' : 'Delete Forever'}
              </button>
              <button
                onClick={() => { onShowDeleteConfirm(false); onDeleteConfirmEmailChange(''); }}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, desc, color, loading, onClick }: {
  icon: typeof Shield;
  label: string;
  desc: string;
  color: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50 ${color}`}
    >
      {loading ? (
        <Spinner size="sm" className="border-current shrink-0" />
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      <div className="text-left">
        <p className="font-medium">{label}</p>
        <p className="text-xs opacity-60">{desc}</p>
      </div>
    </button>
  );
}
