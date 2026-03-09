'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FileText,
  Mic,
  Settings,
  Zap,
  Plane,
  Droplets,
  Shield,
  ChevronRight,
  ChevronDown,
  LogOut,
  X,
  Users,
  DollarSign,
  Eye,
  CheckSquare,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useSidebar } from './SidebarContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';

const ROLE_LABELS: Record<string, string> = {
  dg: 'Director General',
  minister: 'Minister',
  ps: 'Permanent Secretary',
  agency_admin: 'Agency Admin',
  officer: 'Officer',
};

const mainNavItems = [
  { href: '/', label: 'Mission Control', icon: LayoutDashboard, moduleSlug: 'briefing' },
  { href: '/intel', label: 'Agency Intel', icon: Activity, moduleSlug: 'agency-intel' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, moduleSlug: 'tasks' },
  { href: '/oversight', label: 'Oversight', icon: Eye, moduleSlug: 'oversight' },
  { href: '/budget', label: 'Budget 2026', icon: DollarSign, moduleSlug: 'budget' },
  { href: '/meetings', label: 'Meetings', icon: Mic, moduleSlug: 'meetings' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, moduleSlug: 'calendar' },
  { href: '/documents', label: 'Documents', icon: FileText, moduleSlug: 'documents' },
  { href: '/applications', label: 'Applications', icon: ClipboardList, moduleSlug: 'applications' },
];

const agencies = [
  { code: 'gpl', label: 'GPL', name: 'Guyana Power & Light', icon: Zap, moduleSlug: 'gpl-deep-dive' },
  { code: 'cjia', label: 'CJIA', name: 'CJIA Airport', icon: Plane, moduleSlug: 'cjia-deep-dive' },
  { code: 'gwi', label: 'GWI', name: 'Guyana Water Inc.', icon: Droplets, moduleSlug: 'gwi-deep-dive' },
  { code: 'gcaa', label: 'GCAA', name: 'Civil Aviation', icon: Shield, moduleSlug: 'gcaa-deep-dive' },
];

const adminItems = [
  { href: '/admin/people', label: 'People', icon: Users, moduleSlug: 'people' },
  { href: '/admin', label: 'Settings', icon: Settings, moduleSlug: 'settings' },
];

// Roles that can see the admin section
const ADMIN_ROLES = ['dg', 'minister', 'ps'];
// Roles that can see the full agency list (non-agency users see all; agency users see only theirs)
const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [agenciesOpen, setAgenciesOpen] = useState(true);
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { canAccess } = useModuleAccess();

  const userRole = (session?.user as { role?: string })?.role || 'officer';
  const userAgency = (session?.user as { agency?: string | null })?.agency || null;
  const userName = session?.user?.name || 'User';
  const roleLabel = ROLE_LABELS[userRole] || userRole;

  const showAdmin = ADMIN_ROLES.includes(userRole);
  const isMinistry = MINISTRY_ROLES.includes(userRole);

  // Agency users only see their own agency in the sidebar
  const visibleAgencies = isMinistry
    ? agencies
    : agencies.filter(a => a.code === userAgency?.toLowerCase());

  // Filter by module access
  const filteredMainNav = mainNavItems.filter(item => canAccess(item.moduleSlug));
  const filteredAgencies = visibleAgencies.filter(a => canAccess(a.moduleSlug));
  const filteredAdminItems = adminItems.filter(item => canAccess(item.moduleSlug));

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const allNavItems = [...mainNavItems, ...adminItems];
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/admin') return pathname === '/admin';
    if (!pathname.startsWith(href)) return false;
    return !allNavItems.some(
      item => item.href !== href && item.href.startsWith(href) && pathname.startsWith(item.href),
    );
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
          aria-hidden="true"
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
                src="/app-icon.png"
                alt="DG Work OS"
                width={48}
                height={48}
                priority
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="font-bold text-white text-base leading-tight tracking-tight">Work <span className="text-[#d4af37]">OS</span></h1>
              <p className="text-[#64748b] text-xs font-medium tracking-wide uppercase">{roleLabel}</p>
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
        <nav className="flex-1 py-6 overflow-y-auto" role="navigation" aria-label="Main navigation">
          <div className="px-4 mb-2">
            <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Main Menu</span>
          </div>
          {filteredMainNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={`sidebar-item ${active ? 'active' : ''}`}
                {...(active ? { 'aria-current': 'page' as const } : {})}
              >
                <Icon className={active ? 'text-[#d4af37]' : ''} aria-hidden="true" />
                <span className="text-[15px]">{item.label}</span>
                {active && <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />}
              </Link>
            );
          })}

          {/* Agencies Section */}
          {filteredAgencies.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setAgenciesOpen(!agenciesOpen)}
                className="w-full px-4 mb-2 flex items-center justify-between"
                aria-expanded={agenciesOpen}
                aria-label="Agencies"
              >
                <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Agencies</span>
                {agenciesOpen ? (
                  <ChevronDown className="h-3 w-3 text-[#64748b]" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-[#64748b]" aria-hidden="true" />
                )}
              </button>
              {agenciesOpen && (
                <div className="space-y-0.5">
                  {filteredAgencies.map((agency) => {
                    const Icon = agency.icon;
                    const href = `/intel/${agency.code}`;
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={agency.code}
                        href={href}
                        onClick={handleNavClick}
                        className={`sidebar-item ${active ? 'active' : ''}`}
                        {...(active ? { 'aria-current': 'page' as const } : {})}
                      >
                        <Icon className={`h-4 w-4 ${active ? 'text-[#d4af37]' : ''}`} aria-hidden="true" />
                        <span className="text-[15px]">{agency.label}</span>
                        <span className="ml-auto text-xs text-[#64748b] hidden group-hover:inline">{agency.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Admin Section (DG, Minister, PS only) */}
          {showAdmin && filteredAdminItems.length > 0 && (
            <>
              <div className="mt-8 px-4 mb-2">
                <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Admin</span>
              </div>
              {filteredAdminItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={`sidebar-item ${active ? 'active' : ''}`}
                    {...(active ? { 'aria-current': 'page' as const } : {})}
                  >
                    <Icon className={active ? 'text-[#d4af37]' : ''} aria-hidden="true" />
                    <span className="text-[15px]">{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#2d3a52]/50 space-y-3">
          <div className="glass-card p-4">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-[#d4af37] mt-0.5">{roleLabel}</p>
            {userAgency && (
              <p className="text-xs text-[#64748b] mt-0.5">{userAgency}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
