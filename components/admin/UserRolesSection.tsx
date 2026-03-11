'use client';

import { Spinner } from '@/components/ui/Spinner';

export interface ModuleInfo {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  default_roles: string[];
  is_active: boolean;
}

export interface UserRolesUser {
  id: string;
  role: string;
  agency: string | null;
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
  dg: 'bg-gold-500/20 text-gold-500 border border-gold-500/30',
  minister: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  ps: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  agency_admin: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  officer: 'bg-navy-700/20 text-slate-400 border border-navy-700/30',
};

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

interface UserRolesSectionProps {
  user: UserRolesUser;
  isDG: boolean;
  isSelf: boolean;
  editRole: string;
  editAgency: string | null;
  onFieldChange: (field: string, value: string | null) => void;
}

export function UserRolesSection({
  user,
  isDG,
  isSelf,
  editRole,
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
          <span className={`text-xs px-2.5 py-1 rounded ${ROLE_COLORS[user.role] || ROLE_COLORS.officer}`}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
        )}
      </Field>
      <Field label="Agency">
        {isDG && !isSelf && !MINISTRY_ROLES.includes(editRole) ? (
          <select
            value={editAgency || ''}
            onChange={e => onFieldChange('agency', e.target.value || null)}
            aria-label="User agency"
            className="w-full px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">No agency</option>
            {AGENCY_OPTIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-slate-400">
            {MINISTRY_ROLES.includes(editRole) ? 'Ministry (all agencies)' : user.agency?.toUpperCase() || 'None'}
          </p>
        )}
      </Field>
      {MINISTRY_ROLES.includes(editRole) && (
        <p className="text-xs text-navy-600">Ministry roles have access to all agencies.</p>
      )}
    </div>
  );
}

// --- Module Access sub-section ---

interface ModuleAccessSectionProps {
  user: UserRolesUser;
  allModules: ModuleInfo[];
  userModuleGrants: string[];
  modulesLoading: boolean;
  moduleToggling: string | null;
  onToggleModuleAccess: (moduleSlug: string, currentlyHasAccess: boolean) => void;
}

export function ModuleAccessSection({
  user,
  allModules,
  userModuleGrants,
  modulesLoading,
  moduleToggling,
  onToggleModuleAccess,
}: ModuleAccessSectionProps) {
  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {allModules
        .filter(m => m.is_active)
        .map(mod => {
          const isDefaultForRole = mod.default_roles.includes(user.role);
          const hasExplicitGrant = userModuleGrants.includes(mod.slug);
          const hasAccess = isDefaultForRole || hasExplicitGrant;
          const isToggling = moduleToggling === mod.slug;

          return (
            <label
              key={mod.slug}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                hasAccess ? 'bg-gold-500/5' : 'hover:bg-navy-800/30'
              } ${isToggling ? 'opacity-50' : ''}`}
            >
              <input
                type="checkbox"
                checked={hasAccess}
                onChange={() => {
                  if (isDefaultForRole && !hasExplicitGrant) {
                    // Can't revoke default role access via this UI
                    return;
                  }
                  onToggleModuleAccess(mod.slug, hasExplicitGrant);
                }}
                disabled={isToggling || (isDefaultForRole && !hasExplicitGrant)}
                className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{mod.name}</p>
                {isDefaultForRole && (
                  <p className="text-[10px] text-gold-500">Default for {ROLE_LABELS[user.role] || user.role}</p>
                )}
                {hasExplicitGrant && !isDefaultForRole && (
                  <p className="text-[10px] text-green-400">Explicitly granted</p>
                )}
              </div>
              {isToggling && (
                <Spinner size="sm" className="shrink-0" />
              )}
            </label>
          );
        })}
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
