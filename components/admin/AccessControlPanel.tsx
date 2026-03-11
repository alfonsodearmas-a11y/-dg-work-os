'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Lock, UserPlus, Trash2, Search, ChevronDown,
  Eye, Edit3, Settings, Clock, AlertTriangle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { TeamMember, ObjectAccessGrant } from '@/lib/people-types';

const ACCESS_ICONS = {
  view: Eye,
  edit: Edit3,
  manage: Settings,
};

const ACCESS_COLORS = {
  view: 'text-blue-400 bg-blue-500/10',
  edit: 'text-amber-400 bg-amber-500/10',
  manage: 'text-gold-500 bg-gold-500/10',
};

const OBJECT_TYPES = [
  { value: 'dashboard', label: 'Dashboards' },
  { value: 'reports', label: 'Reports' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'agency', label: 'Agencies' },
];

interface Props {
  members: TeamMember[];
  myPermissions: string[];
  loading: boolean;
}

export function AccessControlPanel({ members, myPermissions, loading }: Props) {
  const [selectedType, setSelectedType] = useState('dashboard');
  const [grants, setGrants] = useState<(ObjectAccessGrant & { user_name: string; user_email: string })[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [search, setSearch] = useState('');

  const canManageAccess = myPermissions.includes('user.manage_roles') || myPermissions.includes('dashboard.share');

  const fetchGrants = async (objectType: string) => {
    setGrantsLoading(true);
    try {
      const res = await fetch(`/api/people/access?objectType=${objectType}`);
      const data = await res.json();
      setGrants(data.grants || []);
    } catch {
      setGrants([]);
    }
    setGrantsLoading(false);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    fetchGrants(type);
  };

  const handleRevoke = async (grantId: string) => {
    if (!confirm('Revoke this access grant?')) return;
    try {
      const res = await fetch(`/api/people/access?grantId=${grantId}`, { method: 'DELETE' });
      if (res.ok) {
        setGrants(prev => prev.filter(g => g.id !== grantId));
      }
    } catch {}
  };

  // Initialize: fetch grants for default type
  useEffect(() => { fetchGrants(selectedType); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredGrants = useMemo(() => {
    if (!search) return grants;
    const q = search.toLowerCase();
    return grants.filter(g =>
      g.user_name.toLowerCase().includes(q) ||
      g.user_email.toLowerCase().includes(q) ||
      (g.object_id || '').toLowerCase().includes(q)
    );
  }, [grants, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-gold-500" />
          <h2 className="text-lg font-semibold text-white">Access Control</h2>
        </div>
        {canManageAccess && (
          <button
            onClick={() => setShowGrantModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors text-sm font-medium"
          >
            <UserPlus className="h-4 w-4" />
            Grant Access
          </button>
        )}
      </div>

      {/* Object type selector */}
      <div className="flex gap-2">
        {OBJECT_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => handleTypeChange(t.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedType === t.value
                ? 'bg-gold-500/20 text-gold-500 border border-gold-500/30'
                : 'bg-navy-900 text-navy-600 border border-navy-800 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search grants..."
          aria-label="Search access grants"
          className="w-full pl-9 pr-4 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
        />
      </div>

      {/* Grants list */}
      <div className="card-premium overflow-hidden">
        {grantsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filteredGrants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-navy-600">
            <Lock className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No access grants for {OBJECT_TYPES.find(t => t.value === selectedType)?.label}</p>
            <p className="text-xs mt-1">Grant access to share objects with team members</p>
          </div>
        ) : (
          <div className="divide-y divide-navy-800/50">
            {filteredGrants.map(g => {
              const Icon = ACCESS_ICONS[g.access_level as keyof typeof ACCESS_ICONS] || Eye;
              const colorClass = ACCESS_COLORS[g.access_level as keyof typeof ACCESS_COLORS] || ACCESS_COLORS.view;
              const isExpired = g.expires_at && new Date(g.expires_at) < new Date();

              return (
                <div key={g.id} className={`flex items-center gap-4 px-4 py-3 ${isExpired ? 'opacity-50' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium truncate">{g.user_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colorClass}`}>
                        {g.access_level}
                      </span>
                      {isExpired && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> expired
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy-600 truncate">
                      {g.user_email}
                      {g.object_id && <> · <span className="font-mono">{g.object_id}</span></>}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-navy-700">
                      {g.reason && <span>{g.reason}</span>}
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(parseISO(g.granted_at), { addSuffix: true })}
                      </span>
                      {g.expires_at && (
                        <span>
                          Expires {formatDistanceToNow(parseISO(g.expires_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>

                  {canManageAccess && !isExpired && (
                    <button
                      onClick={() => handleRevoke(g.id)}
                      className="p-1.5 rounded text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Revoke access"
                      aria-label="Revoke access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <GrantAccessModal
          objectType={selectedType}
          members={members}
          onClose={() => setShowGrantModal(false)}
          onSuccess={() => {
            setShowGrantModal(false);
            fetchGrants(selectedType);
          }}
        />
      )}
    </div>
  );
}

function GrantAccessModal({
  objectType,
  members,
  onClose,
  onSuccess,
}: {
  objectType: string;
  members: TeamMember[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const grantModalRef = useRef<HTMLDivElement>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [objectId, setObjectId] = useState('');
  const [accessLevel, setAccessLevel] = useState('view');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (grantModalRef.current) {
      const focusable = grantModalRef.current.querySelector<HTMLElement>('select, input, button, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/people/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          objectType,
          objectId: objectId || null,
          accessLevel,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Failed to grant access');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  };

  const activeMembers = members.filter(m => m.status !== 'archived' && m.status !== 'suspended');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div ref={grantModalRef} role="dialog" aria-modal="true" aria-labelledby="grant-access-modal-title" className="card-premium w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 id="grant-access-modal-title" className="text-lg font-bold text-white">Grant Access</h3>
          <button onClick={onClose} className="p-1 text-navy-600 hover:text-white transition-colors" aria-label="Close">
            <ChevronDown className="h-5 w-5 rotate-[-90deg]" />
          </button>
        </div>

        <p className="text-xs text-navy-600">
          Grant a team member access to {objectType} resources.
        </p>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="grant-team-member" className="block text-xs text-slate-400 mb-1.5">Team Member</label>
            <select
              id="grant-team-member"
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              required
              aria-required="true"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              <option value="">Select user...</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email} ({m.role}{m.agency ? ` · ${m.agency.toUpperCase()}` : ''})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="grant-object-id" className="block text-xs text-slate-400 mb-1.5">Object ID (optional)</label>
            <input
              id="grant-object-id"
              type="text"
              value={objectId}
              onChange={e => setObjectId(e.target.value)}
              placeholder="Leave blank for all objects of this type"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Access Level</label>
            <div className="flex gap-2">
              {(['view', 'edit', 'manage'] as const).map(level => {
                const Icon = ACCESS_ICONS[level];
                const isSelected = accessLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setAccessLevel(level)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-gold-500/50 bg-gold-500/10 text-gold-500'
                        : 'border-navy-800 text-navy-600 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="grant-reason" className="block text-xs text-slate-400 mb-1.5">Reason (optional)</label>
            <input
              id="grant-reason"
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this access needed?"
              className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !targetUserId}
            className="w-full py-2.5 rounded-lg bg-gold-500 text-navy-950 font-semibold text-sm hover:bg-[#e5c348] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Granting...' : 'Grant Access'}
          </button>
        </form>
      </div>
    </div>
  );
}
