'use client';

import { Spinner } from '@/components/ui/Spinner';
import { RotateCcw } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, MINISTRY_ROLES } from '@/lib/people-types';
import type { ModuleRecord, ModuleOverride } from '@/lib/module-types';

export type ModuleInfo = Pick<ModuleRecord, 'id' | 'slug' | 'name' | 'icon' | 'default_roles' | 'is_active'>;
export type { ModuleOverride as ModuleOverrideInfo };

export interface UserRolesUser {
  id: string;
  role: string;
  formal_title?: string | null;
  agency: string | null;
}

const AGENCY_OPTIONS = [
  { value: 'gpl', label: 'GPL' },
  { value: 'gwi', label: 'GWI' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gcaa', label: 'GCAA' },
  { value: 'heci', label: 'HECI' },
  { value: 'marad', label: 'MARAD' },
  { value: 'has', label: 'HAS' },
];

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
            {user.formal_title || ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
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
  moduleOverrides: ModuleOverride[];
  modulesLoading: boolean;
  moduleToggling: string | null;
  resettingDefaults: boolean;
  onToggleModuleAccess: (moduleSlug: string, currentlyHasAccess: boolean) => void;
  onResetToDefaults: () => void;
}

export function ModuleAccessSection({
  user,
  allModules,
  moduleOverrides,
  modulesLoading,
  moduleToggling,
  resettingDefaults,
  onToggleModuleAccess,
  onResetToDefaults,
}: ModuleAccessSectionProps) {
  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  const overrideMap = new Map(moduleOverrides.map(o => [o.slug, o.access_type]));
  const hasAnyOverrides = moduleOverrides.length > 0;

  return (
    <div className="space-y-2">
      {/* Reset to Defaults button */}
      {hasAnyOverrides && (
        <button
          onClick={onResetToDefaults}
          disabled={resettingDefaults}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
        >
          {resettingDefaults ? (
            <Spinner size="sm" className="border-amber-400 shrink-0" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          )}
          Reset to Role Defaults
        </button>
      )}

      <div className="space-y-1">
        {allModules
          .filter(m => m.is_active)
          .map(mod => {
            const isDefaultForRole = mod.default_roles.includes(user.role);
            const override = overrideMap.get(mod.slug);
            const hasExplicitGrant = override === 'grant';
            const hasExplicitDeny = override === 'deny';
            const hasAccess = hasExplicitDeny ? false : (hasExplicitGrant || isDefaultForRole);
            const isToggling = moduleToggling === mod.slug;

            // Determine label and color
            let labelText = '';
            let labelColor = '';
            if (hasExplicitDeny && isDefaultForRole) {
              labelText = 'Access revoked (override)';
              labelColor = 'text-red-400';
            } else if (hasExplicitGrant && !isDefaultForRole) {
              labelText = 'Access granted (override)';
              labelColor = 'text-emerald-400';
            } else if (hasExplicitGrant && isDefaultForRole) {
              // Redundant grant on a default module — treat as override
              labelText = 'Explicitly granted';
              labelColor = 'text-emerald-400';
            } else if (isDefaultForRole) {
              labelText = `Default for ${ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}`;
              labelColor = 'text-gold-500';
            }
            // Non-default, no override = no label, no access

            return (
              <label
                key={mod.slug}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  hasAccess ? 'bg-gold-500/5' : hasExplicitDeny ? 'bg-red-500/5' : 'hover:bg-navy-800/30'
                } ${isToggling ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={hasAccess}
                  onChange={() => onToggleModuleAccess(mod.slug, hasAccess)}
                  disabled={isToggling}
                  className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${hasAccess ? 'text-white' : hasExplicitDeny ? 'text-slate-500 line-through' : 'text-slate-400'}`}>
                    {mod.name}
                  </p>
                  {labelText && (
                    <p className={`text-[10px] ${labelColor}`}>{labelText}</p>
                  )}
                </div>
                {isToggling && (
                  <Spinner size="sm" className="shrink-0" />
                )}
              </label>
            );
          })}
      </div>
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
