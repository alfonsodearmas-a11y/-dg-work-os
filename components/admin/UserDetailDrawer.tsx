'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Shield, ShieldOff, Archive, RotateCcw, LogOut, Trash2, Mail,
  ChevronDown, AlertTriangle, Clock, UserCheck, UserX,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

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

interface AuditEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string;
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

const ROLE_OPTIONS = [
  { value: 'dg', label: 'Director General' },
  { value: 'minister', label: 'Minister' },
  { value: 'ps', label: 'Permanent Secretary' },
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

const STATUS_STYLES: Record<string, { bg: string; label: string; icon: typeof UserCheck }> = {
  active: { bg: 'bg-green-500/20 text-green-400', label: 'Active', icon: UserCheck },
  pending: { bg: 'bg-amber-500/20 text-amber-400', label: 'Pending', icon: Clock },
  inactive: { bg: 'bg-gray-500/20 text-gray-400', label: 'Inactive', icon: UserX },
  suspended: { bg: 'bg-red-500/20 text-red-400', label: 'Suspended', icon: ShieldOff },
  archived: { bg: 'bg-gray-500/20 text-gray-500', label: 'Archived', icon: Archive },
};

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

const AUDIT_LABELS: Record<string, string> = {
  created: 'created this account',
  updated: 'updated user fields',
  suspended: 'suspended this user',
  reactivated: 'reactivated this user',
  archived: 'archived this user',
  restored: 'restored this user',
  force_signout: 'forced sign-out',
  resend_invite: 'resent the invite email',
  deleted_permanently: 'permanently deleted this user',
};

export function UserDetailDrawer({ user, isOpen, isDG, currentUserId, onClose, onUserUpdated, showToast }: UserDetailDrawerProps) {
  const [editRole, setEditRole] = useState('');
  const [editAgency, setEditAgency] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('profile');

  const isSelf = user?.id === currentUserId;
  const status = user?.status || (user?.is_active ? 'active' : 'inactive');

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      setEditRole(user.role);
      setEditAgency(user.agency);
      setEditName(user.name || '');
      setDirty(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmEmail('');
      setExpandedSection('profile');
    }
  }, [user]);

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

  const handleFieldChange = (field: string, value: string | null) => {
    if (field === 'role') {
      setEditRole(value || '');
      if (MINISTRY_ROLES.includes(value || '')) setEditAgency(null);
    } else if (field === 'agency') {
      setEditAgency(value);
    } else if (field === 'name') {
      setEditName(value || '');
    }
    setDirty(true);
  };

  const saveChanges = async () => {
    if (!user || !dirty) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editRole !== user.role) payload.role = editRole;
      if (editAgency !== user.agency) payload.agency = MINISTRY_ROLES.includes(editRole) ? null : editAgency;
      if (editName !== (user.name || '')) payload.name = editName;

      if (Object.keys(payload).length === 0) { setDirty(false); setSaving(false); return; }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('User updated', 'success');
        setDirty(false);
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

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
  };

  const formatRelative = (d: string | null) => {
    if (!d) return 'Never';
    try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return d; }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[46] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[440px] bg-[#0a1628] border-l border-[#2d3a52] z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#2d3a52] px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">User Details</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2d3a52] text-[#94a3b8] hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* User Header Card */}
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#2d3a52] flex items-center justify-center text-sm font-bold text-[#94a3b8]">
                {getInitials(user.name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{user.name || 'No name'}</p>
              <p className="text-[#64748b] text-xs truncate">{user.email}</p>
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
            <div className="space-y-3">
              <Field label="Name">
                {isDG && !isSelf ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
                  />
                ) : (
                  <p className="text-sm text-white">{user.name || 'Not set'}</p>
                )}
              </Field>
              <Field label="Email">
                <p className="text-sm text-white">{user.email}</p>
              </Field>
              <Field label="Created">
                <p className="text-sm text-[#94a3b8]">{formatDate(user.created_at)}</p>
              </Field>
              {user.invited_at && (
                <Field label="Invited">
                  <p className="text-sm text-[#94a3b8]">{formatDate(user.invited_at)}</p>
                </Field>
              )}
              {isDG && status === 'pending' && (
                <div>
                  <button
                    onClick={() => performAction('resend_invite', `Resend invite email to ${user.email}?`)}
                    disabled={actionLoading === 'resend_invite'}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === 'resend_invite' ? (
                      <div className="w-4 h-4 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Resend Invite Email
                  </button>
                </div>
              )}
              <Field label="First Login">
                <p className="text-sm text-[#94a3b8]">{formatDate(user.first_login_at)}</p>
              </Field>
              <Field label="Last Active">
                <p className="text-sm text-[#94a3b8]">{formatRelative(user.last_seen_at || user.last_login)}</p>
              </Field>
              <Field label="Login Count">
                <p className="text-sm text-[#94a3b8]">{user.login_count ?? 0}</p>
              </Field>
            </div>
          </Section>

          {/* Role & Permissions */}
          <Section title="Role & Permissions" id="role" expanded={expandedSection === 'role'} onToggle={() => toggleSection('role')}>
            <div className="space-y-3">
              <Field label="Role">
                {isDG && !isSelf ? (
                  <select
                    value={editRole}
                    onChange={e => handleFieldChange('role', e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-xs px-2.5 py-1 rounded ${ROLE_COLORS[user.role] || ROLE_COLORS.officer}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                )}
              </Field>
              <Field label="Agency">
                {isDG && !isSelf && !MINISTRY_ROLES.includes(editRole) ? (
                  <select
                    value={editAgency || ''}
                    onChange={e => handleFieldChange('agency', e.target.value || null)}
                    className="w-full px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
                  >
                    <option value="">No agency</option>
                    {AGENCY_OPTIONS.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-[#94a3b8]">
                    {MINISTRY_ROLES.includes(editRole) ? 'Ministry (all agencies)' : user.agency?.toUpperCase() || 'None'}
                  </p>
                )}
              </Field>
              {MINISTRY_ROLES.includes(editRole) && (
                <p className="text-xs text-[#64748b]">Ministry roles have access to all agencies.</p>
              )}
            </div>
          </Section>

          {/* Security Section (DG only, not self) */}
          {isDG && !isSelf && (
            <Section title="Security" id="security" expanded={expandedSection === 'security'} onToggle={() => toggleSection('security')}>
              <div className="space-y-2">
                {/* Suspend / Reactivate */}
                {status === 'suspended' ? (
                  <ActionButton
                    icon={RotateCcw}
                    label="Reactivate User"
                    desc="Restore access for this user"
                    color="text-green-400 hover:bg-green-500/10"
                    loading={actionLoading === 'reactivate'}
                    onClick={() => performAction('reactivate', 'Reactivate this user? They will regain access.')}
                  />
                ) : status !== 'archived' ? (
                  <ActionButton
                    icon={ShieldOff}
                    label="Suspend User"
                    desc="Immediately revoke access"
                    color="text-amber-400 hover:bg-amber-500/10"
                    loading={actionLoading === 'suspend'}
                    onClick={() => performAction('suspend', 'Suspend this user? They will lose access immediately.')}
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
                    onClick={() => performAction('restore', 'Restore this archived user?')}
                  />
                ) : status !== 'archived' ? (
                  <ActionButton
                    icon={Archive}
                    label="Archive User"
                    desc="Move to archived — can be restored later"
                    color="text-gray-400 hover:bg-gray-500/10"
                    loading={actionLoading === 'archive'}
                    onClick={() => performAction('archive', 'Archive this user? They will be moved to the archived tab.')}
                  />
                ) : null}

                {/* Force Sign Out */}
                <ActionButton
                  icon={LogOut}
                  label="Force Sign Out"
                  desc="End all active sessions"
                  color="text-orange-400 hover:bg-orange-500/10"
                  loading={actionLoading === 'force_signout'}
                  onClick={() => performAction('force_signout', 'Force sign out this user?')}
                />

                {/* Permanent Delete */}
                <div className="mt-4 pt-4 border-t border-[#2d3a52]">
                  <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Danger Zone
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
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
                        onChange={e => setDeleteConfirmEmail(e.target.value)}
                        placeholder={user.email}
                        className="w-full px-3 py-1.5 bg-[#0a1628] border border-red-500/30 rounded text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-red-500/50"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleteConfirmEmail !== user.email || actionLoading === 'delete'}
                          className="flex-1 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {actionLoading === 'delete' ? 'Deleting...' : 'Delete Forever'}
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(''); }}
                          className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Activity Log */}
          <Section title="Activity Log" id="activity" expanded={expandedSection === 'activity'} onToggle={() => toggleSection('activity')}>
            {loadingAudit ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : audit.length === 0 ? (
              <p className="text-xs text-[#64748b] py-4 text-center">No activity recorded</p>
            ) : (
              <div className="space-y-0">
                {audit.map(entry => (
                  <div key={entry.id} className="flex gap-3 py-2.5 border-b border-[#2d3a52]/50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3d4a62] mt-2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#94a3b8]">
                        <span className="text-white font-medium">{entry.actor_name}</span>{' '}
                        {AUDIT_LABELS[entry.action] || entry.action}
                      </p>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && entry.action === 'updated' && (
                        <div className="mt-1 text-xs text-[#64748b]">
                          {Object.entries(entry.metadata).map(([key, val]) => {
                            const change = val as { from: unknown; to: unknown };
                            return (
                              <p key={key}>
                                {key}: {String(change.from || 'none')} → {String(change.to || 'none')}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[10px] text-[#4a5568] mt-0.5">{formatRelative(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Save Bar (sticky at bottom when dirty) */}
        {dirty && isDG && (
          <div className="flex-shrink-0 border-t border-[#2d3a52] bg-[#1a2744] px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-[#94a3b8]">Unsaved changes</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (user) {
                    setEditRole(user.role);
                    setEditAgency(user.agency);
                    setEditName(user.name || '');
                    setDirty(false);
                  }
                }}
                className="px-3 py-1.5 rounded text-xs text-[#94a3b8] hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-[#d4af37] text-[#0a1628] text-xs font-semibold hover:bg-[#e5c348] disabled:opacity-50 transition-colors"
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

// --- Sub-components ---

function Section({ title, id, expanded, onToggle, children }: {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#2d3a52]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#2d3a52]/20 transition-colors"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-5 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[#64748b] mb-1">{label}</label>
      {children}
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
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
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
