'use client';

import { Mail, Clock, UserCheck, UserX, Archive } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { ShieldOff } from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

export interface UserProfileUser {
  id: string;
  email: string;
  name: string | null;
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
}

interface UserProfileSectionProps {
  user: UserProfileUser;
  isDG: boolean;
  isSelf: boolean;
  status: string;
  editName: string;
  actionLoading: string | null;
  onFieldChange: (field: string, value: string | null) => void;
  onAction: (action: string, confirmMsg: string) => void;
}

function formatDate(d: string | null): string {
  if (!d) return 'Never';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

function formatRelative(d: string | null): string {
  if (!d) return 'Never';
  try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return d; }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-navy-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function UserProfileSection({
  user,
  isDG,
  isSelf,
  status,
  editName,
  actionLoading,
  onFieldChange,
  onAction,
}: UserProfileSectionProps) {
  return (
    <div className="space-y-3">
      <Field label="Name">
        {isDG && !isSelf ? (
          <input
            type="text"
            value={editName}
            onChange={e => onFieldChange('name', e.target.value)}
            aria-label="User name"
            className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
        ) : (
          <p className="text-sm text-white">{user.name || 'Not set'}</p>
        )}
      </Field>
      <Field label="Email">
        <p className="text-sm text-white">{user.email}</p>
      </Field>
      <Field label="Created">
        <p className="text-sm text-slate-400">{formatDate(user.created_at)}</p>
      </Field>
      {user.invited_at && (
        <Field label="Invited">
          <p className="text-sm text-slate-400">{formatDate(user.invited_at)}</p>
        </Field>
      )}
      {isDG && status === 'pending' && (
        <div>
          <button
            onClick={() => onAction('resend_invite', `Resend invite email to ${user.email}?`)}
            disabled={actionLoading === 'resend_invite'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gold-500 hover:bg-gold-500/10 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'resend_invite' ? (
              <Spinner size="sm" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Resend Invite Email
          </button>
        </div>
      )}
      <Field label="First Login">
        <p className="text-sm text-slate-400">{formatDate(user.first_login_at)}</p>
      </Field>
      <Field label="Last Active">
        <p className="text-sm text-slate-400">{formatRelative(user.last_seen_at || user.last_login)}</p>
      </Field>
      <Field label="Login Count">
        <p className="text-sm text-slate-400">{user.login_count ?? 0}</p>
      </Field>
    </div>
  );
}
