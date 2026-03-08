'use client';

import { useState, useMemo } from 'react';
import { Shield, Check, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import type { RoleWithPermissions, CorePermission } from '@/lib/people-types';

const ROLE_COLORS: Record<string, string> = {
  dg: 'text-[#d4af37]',
  minister: 'text-purple-400',
  ps: 'text-blue-400',
  agency_admin: 'text-cyan-400',
  officer: 'text-[#94a3b8]',
};

interface Props {
  roles: RoleWithPermissions[];
  allPermissions: CorePermission[];
  myPermissions: string[];
  myRole: string;
  loading: boolean;
}

export function PermissionsPanel({ roles, allPermissions, myPermissions, myRole, loading }: Props) {
  const [search, setSearch] = useState('');
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());

  // Group permissions by resource
  const grouped = useMemo(() => {
    const map = new Map<string, CorePermission[]>();
    for (const p of allPermissions) {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) {
        continue;
      }
      const list = map.get(p.resource) || [];
      list.push(p);
      map.set(p.resource, list);
    }
    return map;
  }, [allPermissions, search]);

  const toggleResource = (resource: string) => {
    setExpandedResources(prev => {
      const next = new Set(prev);
      if (next.has(resource)) next.delete(resource);
      else next.add(resource);
      return next;
    });
  };

  // Build permission lookup: role name → Set of permission names
  const rolePermMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of roles) {
      map.set(role.name, new Set(role.permissions.map(p => p.name)));
    }
    return map;
  }, [roles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-label="Loading">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const resourceLabels: Record<string, string> = {
    dashboard: 'Dashboards',
    reports: 'Reports',
    users: 'Users',
    settings: 'Settings',
    audit_logs: 'Audit Logs',
    agency: 'Agencies',
    tasks: 'Tasks',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Permission Matrix</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search permissions..."
            aria-label="Search permissions"
            className="pl-9 pr-4 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 w-56"
          />
        </div>
      </div>

      {/* Your permissions */}
      <div className="card-premium p-4">
        <p className="text-xs text-[#64748b] mb-2">
          Your role: <span className={`font-medium ${ROLE_COLORS[myRole] || 'text-white'}`}>{myRole}</span>
          {' · '}
          <span className="text-white font-medium">{myPermissions.length}</span> permissions
        </p>
        <div className="flex flex-wrap gap-1.5">
          {myPermissions.slice(0, 12).map(p => (
            <span key={p} className="px-2 py-0.5 rounded bg-[#d4af37]/10 text-[#d4af37] text-[10px] font-mono">
              {p}
            </span>
          ))}
          {myPermissions.length > 12 && (
            <span className="px-2 py-0.5 rounded bg-[#2d3a52] text-[#64748b] text-[10px]">
              +{myPermissions.length - 12} more
            </span>
          )}
        </div>
      </div>

      {/* Matrix */}
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Permission matrix">
            <thead>
              <tr className="border-b border-[#2d3a52]">
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase w-60">
                  Permission
                </th>
                {roles.map(r => (
                  <th key={r.name} scope="col" className="px-3 py-3 text-center">
                    <span className={`text-xs font-semibold ${ROLE_COLORS[r.name] || 'text-white'}`}>
                      {r.display_name}
                    </span>
                    <p className="text-[10px] text-[#64748b] font-normal mt-0.5">
                      Level {r.hierarchy_level}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([resource, perms]) => {
                const isExpanded = expandedResources.has(resource);
                return (
                  <ResourceGroup
                    key={resource}
                    resource={resource}
                    label={resourceLabels[resource] || resource}
                    permissions={perms}
                    roles={roles}
                    rolePermMap={rolePermMap}
                    isExpanded={isExpanded}
                    onToggle={() => toggleResource(resource)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[#64748b]">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-green-500/20 flex items-center justify-center">
            <Check className="h-3 w-3 text-green-400" />
          </span>
          Granted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-[#2d3a52]/50 flex items-center justify-center">
            <X className="h-3 w-3 text-[#4a5568]" />
          </span>
          Not granted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">admin</span>
          Admin only
        </span>
      </div>
    </div>
  );
}

function ResourceGroup({
  resource,
  label,
  permissions,
  roles,
  rolePermMap,
  isExpanded,
  onToggle,
}: {
  resource: string;
  label: string;
  permissions: CorePermission[];
  roles: RoleWithPermissions[];
  rolePermMap: Map<string, Set<string>>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Count how many roles have each permission
  const summary = roles.map(r => {
    const permSet = rolePermMap.get(r.name) || new Set();
    const granted = permissions.filter(p => permSet.has(p.name)).length;
    return { role: r.name, granted, total: permissions.length };
  });

  return (
    <>
      {/* Group header row */}
      <tr
        onClick={onToggle}
        className="border-b border-[#2d3a52]/50 cursor-pointer hover:bg-[#2d3a52]/10 transition-colors"
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-[#64748b]" />
              : <ChevronRight className="h-3.5 w-3.5 text-[#64748b]" />}
            <span className="text-white font-medium text-xs uppercase tracking-wider">{label}</span>
            <span className="text-[10px] text-[#64748b]">({permissions.length})</span>
          </div>
        </td>
        {summary.map(s => (
          <td key={s.role} className="px-3 py-2.5 text-center">
            <span className={`text-xs font-mono ${s.granted === s.total ? 'text-green-400' : s.granted > 0 ? 'text-amber-400' : 'text-[#4a5568]'}`}>
              {s.granted}/{s.total}
            </span>
          </td>
        ))}
      </tr>

      {/* Permission rows */}
      {isExpanded && permissions.map(p => (
        <tr key={p.id} className="border-b border-[#2d3a52]/30">
          <td className="px-4 py-2 pl-10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#94a3b8] font-mono">{p.name}</span>
              {p.is_admin_only && (
                <span className="px-1 py-0.5 rounded bg-red-500/10 text-red-400 text-[9px]">admin</span>
              )}
            </div>
            <p className="text-[10px] text-[#64748b] mt-0.5">{p.description}</p>
          </td>
          {roles.map(r => {
            const permSet = rolePermMap.get(r.name) || new Set();
            const hasIt = permSet.has(p.name);
            return (
              <td key={r.name} className="px-3 py-2 text-center">
                {hasIt ? (
                  <span className="inline-flex w-5 h-5 rounded bg-green-500/20 items-center justify-center">
                    <Check className="h-3 w-3 text-green-400" />
                  </span>
                ) : (
                  <span className="inline-flex w-5 h-5 rounded bg-[#2d3a52]/30 items-center justify-center">
                    <X className="h-3 w-3 text-[#4a5568]" />
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
