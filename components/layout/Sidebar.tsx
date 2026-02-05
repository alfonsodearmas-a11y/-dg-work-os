'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  FileText,
  Settings,
  Database,
  Building2,
  Zap,
  Plane,
  Droplets,
  Shield,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const mainNavItems = [
  { href: '/', label: 'Daily Briefing', icon: LayoutDashboard },
  { href: '/intel', label: 'Agency Intel', icon: Activity },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/documents', label: 'Documents', icon: FileText },
];

const agencies = [
  { code: 'gpl', label: 'GPL', name: 'Guyana Power & Light', icon: Zap },
  { code: 'cjia', label: 'CJIA', name: 'CJIA Airport', icon: Plane },
  { code: 'gwi', label: 'GWI', name: 'Guyana Water Inc.', icon: Droplets },
  { code: 'gcaa', label: 'GCAA', name: 'Civil Aviation', icon: Shield },
];

const adminItems = [
  { href: '/admin', label: 'Settings & Users', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [agenciesOpen, setAgenciesOpen] = useState(true);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar w-64 min-h-screen flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-[#2d3a52]/50">
        <Link href="/" className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center shadow-lg">
            <span className="text-[#0a1628] font-bold text-lg">DG</span>
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">Work</h1>
            <p className="text-[#d4af37] text-sm font-medium">OS</p>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-6 overflow-y-auto">
        <div className="px-4 mb-2">
          <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Main Menu</span>
        </div>
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              <Icon className={active ? 'text-[#d4af37]' : ''} />
              <span>{item.label}</span>
              {active && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}

        {/* Agencies Section */}
        <div className="mt-8">
          <button
            onClick={() => setAgenciesOpen(!agenciesOpen)}
            className="w-full px-4 mb-2 flex items-center justify-between"
          >
            <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Agencies</span>
            {agenciesOpen ? (
              <ChevronDown className="h-3 w-3 text-[#64748b]" />
            ) : (
              <ChevronRight className="h-3 w-3 text-[#64748b]" />
            )}
          </button>
          {agenciesOpen && (
            <div className="space-y-0.5">
              {agencies.map((agency) => {
                const Icon = agency.icon;
                const href = `/intel/${agency.code}`;
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={agency.code}
                    href={href}
                    className={`sidebar-item ${active ? 'active' : ''}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[#d4af37]' : ''}`} />
                    <span className="text-sm">{agency.label}</span>
                    <span className="ml-auto text-[10px] text-[#64748b] hidden group-hover:inline">{agency.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin Section */}
        <div className="mt-8 px-4 mb-2">
          <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Admin</span>
        </div>
        {adminItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${active ? 'active' : ''}`}
            >
              <Icon className={active ? 'text-[#d4af37]' : ''} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#2d3a52]/50">
        <div className="glass-card p-4">
          <p className="text-xs text-[#64748b] mb-1">Director General</p>
          <p className="text-sm font-medium text-white">Ministry of Public Utilities</p>
          <p className="text-xs text-[#d4af37] mt-1">& Aviation</p>
        </div>
      </div>
    </aside>
  );
}
