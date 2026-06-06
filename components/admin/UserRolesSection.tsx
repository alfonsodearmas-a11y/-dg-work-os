'use client';

import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, TITLE_PRESETS } from '@/lib/people-types';
import { USER_AGENCIES } from '@/lib/constants/agencies';

export interface UserRolesUser {
  id: string;
  role: string;
  formal_title?: string | null;
  agency: string | null;
}

// Canonical UPPERCASE values per migration 106 — must match stored users.agency and the API's Zod enum.
const AGENCY_OPTIONS = USER_AGENCIES.map(a => ({ value: a, label: a }));

interface UserRolesSectionProps {
  user: UserRolesUser;
  isDG: boolean;
  isSelf: boolean;
  editRole: string;
  editTitle: string;
  editAgency: string | null;
  onFieldChange: (field: string, value: string | null) => void;
}

export function UserRolesSection({
  user,
  isDG,
  isSelf,
  editRole,
  editTitle,
  editAgency,
  onFieldChange,
}: UserRolesSectionProps) {
  return (
    <div className="space-y-3">
      <Field label="Role">
        {isDG && !isSelf ? (
          <select
            value={editRole}
            onChange={e => onFieldChange('role', e.target.value)}
            aria-label="User role"
            className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        ) : (
          <span className={`text-xs px-2.5 py-1 rounded ${ROLE_COLORS[user.role] || ROLE_COLORS.agency_manager}`}>
            {user.formal_title || ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
          </span>
        )}
      </Field>
      <Field label="Title (display only)">
        {isDG ? (
          <>
            <input
              type="text"
              list="user-title-presets"
              value={editTitle}
              onChange={e => onFieldChange('formal_title', e.target.value)}
              aria-label="User title"
              placeholder="e.g. Director General"
              className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
            <datalist id="user-title-presets">
              {TITLE_PRESETS.map(t => <option key={t} value={t} />)}
            </datalist>
          </>
        ) : (
          <p className="text-sm text-slate-400">{user.formal_title || '—'}</p>
        )}
      </Field>
      <Field label="Agency">
        {isDG && !isSelf && (editRole) !== 'superadmin' ? (
          <select
            value={editAgency || ''}
            onChange={e => onFieldChange('agency', e.target.value || null)}
            aria-label="User agency"
            className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            {!editAgency && <option value="" disabled>Select agency…</option>}
            {AGENCY_OPTIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-slate-400">
            {editRole === 'superadmin' ? 'All agencies' : user.agency?.toUpperCase() || 'None'}
          </p>
        )}
      </Field>
      {editRole === 'superadmin' && (
        <p className="text-xs text-navy-600">Super Admins have access to all agencies.</p>
      )}
    </div>
  );
}

// --- Shared sub-component ---

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-navy-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
