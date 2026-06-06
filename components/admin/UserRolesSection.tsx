'use client';

import { Spinner } from '@/components/ui/Spinner';
import { RotateCcw } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS, ROLE_OPTIONS, TITLE_PRESETS } from '@/lib/people-types';
import { USER_AGENCIES } from '@/lib/constants/agencies';
import { normalizeRole } from '@/lib/auth-session';
import type { ModuleRecord, ModuleOverride, ModuleOverrideDetailed } from '@/lib/module-types';

export type ModuleInfo = Pick<ModuleRecord, 'id' | 'slug' | 'name' | 'icon' | 'default_roles' | 'is_active'>;
export type { ModuleOverride as ModuleOverrideInfo };

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

// --- Module Access sub-section ---

interface ModuleAccessSectionProps {
  user: UserRolesUser;
  allModules: ModuleInfo[];
  moduleOverrides: ModuleOverride[];
  overridesDetailed: ModuleOverrideDetailed[];
  modulesLoading: boolean;
  moduleToggling: string | null;
  resettingDefaults: boolean;
  onToggleModuleAccess: (moduleSlug: string, currentlyHasAccess: boolean) => void;
  onToggleModuleEdit: (moduleSlug: string, currentCanEdit: boolean) => void;
  onResetToDefaults: () => void;
  onBulkPreset: (preset: 'full' | 'view-only' | 'clear') => void;
}

export function ModuleAccessSection({
  user,
  allModules,
  moduleOverrides,
  overridesDetailed,
  modulesLoading,
  moduleToggling,
  resettingDefaults,
  onToggleModuleAccess,
  onToggleModuleEdit,
  onResetToDefaults,
  onBulkPreset,
}: ModuleAccessSectionProps) {
  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  const overrideMap = new Map(moduleOverrides.map(o => [o.slug, o.access_type]));
  const detailedMap = new Map(overridesDetailed.map(o => [o.slug, o]));
  const hasAnyOverrides = moduleOverrides.length > 0;

  return (
    <div className="space-y-2">
      {/* Bulk preset buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onBulkPreset('full')}
          disabled={resettingDefaults}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors disabled:opacity-50"
        >
          Full Access
        </button>
        <button
          onClick={() => onBulkPreset('view-only')}
          disabled={resettingDefaults}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-navy-800/50 text-slate-400 hover:bg-navy-800 hover:text-white transition-colors disabled:opacity-50"
        >
          View Only All
        </button>
        <button
          onClick={() => onBulkPreset('clear')}
          disabled={resettingDefaults}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-navy-800/50 text-slate-400 hover:bg-navy-800 hover:text-white transition-colors disabled:opacity-50"
        >
          Clear All
        </button>
        {/* Reset to Defaults button */}
        {hasAnyOverrides && (
          <button
            onClick={onResetToDefaults}
            disabled={resettingDefaults}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
          >
            {resettingDefaults ? (
              <Spinner size="sm" className="border-amber-400 shrink-0" />
            ) : (
              <RotateCcw className="h-3 w-3 shrink-0" />
            )}
            Reset Defaults
          </button>
        )}
      </div>

      <div className="space-y-1">
        {allModules
          .filter(m => m.is_active)
          .map(mod => {
            const isDefaultForRole = mod.default_roles.some(r => normalizeRole(r) === normalizeRole(user.role));
            const override = overrideMap.get(mod.slug);
            const detailed = detailedMap.get(mod.slug);
            const hasExplicitGrant = override === 'grant';
            const hasExplicitDeny = override === 'deny';
            const hasAccess = hasExplicitDeny ? false : (hasExplicitGrant || isDefaultForRole);
            const canEdit = detailed ? detailed.can_edit : false;
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
              labelText = 'Explicitly granted';
              labelColor = 'text-emerald-400';
            } else if (isDefaultForRole) {
              labelText = `Default for ${ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}`;
              labelColor = 'text-gold-500';
            }

            return (
              <div
                key={mod.slug}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  hasAccess ? 'bg-gold-500/5' : hasExplicitDeny ? 'bg-red-500/5' : 'hover:bg-navy-800/30'
                } ${isToggling ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={hasAccess}
                  onChange={() => onToggleModuleAccess(mod.slug, hasAccess)}
                  disabled={isToggling}
                  className="w-4 h-4 rounded border-navy-800 accent-gold-500 cursor-pointer disabled:cursor-not-allowed shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${hasAccess ? 'text-white' : hasExplicitDeny ? 'text-slate-500 line-through' : 'text-slate-400'}`}>
                    {mod.name}
                  </p>
                  {labelText && (
                    <p className={`text-[10px] ${labelColor}`}>{labelText}</p>
                  )}
                </div>
                {/* View / Edit segmented toggle */}
                {hasAccess && (
                  <div className="flex rounded-md border border-navy-800 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => { if (canEdit) onToggleModuleEdit(mod.slug, true); }}
                      disabled={isToggling || !canEdit}
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        !canEdit
                          ? 'bg-navy-800/60 text-white'
                          : 'bg-transparent text-navy-600 hover:text-slate-300'
                      }`}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!canEdit) onToggleModuleEdit(mod.slug, false); }}
                      disabled={isToggling || canEdit}
                      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        canEdit
                          ? 'bg-gold-500/20 text-gold-500'
                          : 'bg-transparent text-navy-600 hover:text-slate-300'
                      }`}
                    >
                      Edit
                    </button>
                  </div>
                )}
                {isToggling && (
                  <Spinner size="sm" className="shrink-0" />
                )}
              </div>
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
