'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  FileText,
  Settings,
  Zap,
  Plane,
  Droplets,
  Shield,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useSidebar } from './SidebarContext';

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
  const { mobileOpen, setMobileOpen } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`sidebar w-64 min-h-screen flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#2d3a52]/50 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" onClick={handleNavClick}>
            <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-[#d4af37]/40 shadow-lg shadow-[#d4af37]/10 shrink-0">
              <Image
                src="/ministry-logo.png"
                alt="Ministry of Public Utilities and Aviation"
                width={48}
                height={48}
                priority
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="font-bold text-white text-base leading-tight tracking-tight">Work <span className="text-[#d4af37]">OS</span></h1>
              <p className="text-[#64748b] text-[10px] font-medium tracking-wide uppercase">Director General</p>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-2.5 rounded-lg hover:bg-[#2d3a52]/50 text-[#64748b] hover:text-white transition-colors touch-active"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
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
                onClick={handleNavClick}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <Icon className={active ? 'text-[#d4af37]' : ''} />
                <span className="text-[15px]">{item.label}</span>
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
                      onClick={handleNavClick}
                      className={`sidebar-item ${active ? 'active' : ''}`}
                    >
                      <Icon className={`h-4 w-4 ${active ? 'text-[#d4af37]' : ''}`} />
                      <span className="text-[15px]">{agency.label}</span>
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
                onClick={handleNavClick}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <Icon className={active ? 'text-[#d4af37]' : ''} />
                <span className="text-[15px]">{item.label}</span>
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
    </>
  );
}
