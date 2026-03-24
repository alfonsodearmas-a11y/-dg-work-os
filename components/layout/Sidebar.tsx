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
  PlaneLanding,
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
  ShoppingCart,
  CalendarDays,
  ChevronsLeft,
  Gauge,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { signOut } from 'next-auth/react';
import { useSidebar } from './SidebarContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { ViewAsSelector } from './ViewAsSelector';

import { ROLE_LABELS, MINISTRY_ROLES } from '@/lib/people-types';

// ---------------------------------------------------------------------------
// Sidebar Tooltip — glassmorphism floating label for collapsed icon rail
// ---------------------------------------------------------------------------

function SidebarTooltip({ label, anchorRect }: { label: string; anchorRect: DOMRect | null }) {
  if (!anchorRect) return null;
  const top = anchorRect.top + anchorRect.height / 2 - 16;
  const left = anchorRect.right + 10;
  return createPortal(
    <div
      className="sidebar-tooltip"
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
    >
      {label}
    </div>,
    document.body,
  );
}

function useTooltip() {
  const [tooltip, setTooltip] = useState<{ label: string; rect: DOMRect } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = useCallback((label: string, el: HTMLElement) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTooltip({ label, rect: el.getBoundingClientRect() });
    }, 150);
  }, []);

  const onLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTooltip(null);
  }, []);

  return { tooltip, onEnter, onLeave };
}

const mainNavItems = [
  { href: '/', label: 'Mission Control', icon: LayoutDashboard, moduleSlug: 'briefing' },
  { href: '/intel', label: 'Agency Intel', icon: Activity, moduleSlug: 'agency-intel' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, moduleSlug: 'tasks' },
  { href: '/procurement', label: 'Procurement', icon: ShoppingCart, moduleSlug: 'procurement' },
  { href: '/oversight', label: 'Oversight', icon: Eye, moduleSlug: 'oversight' },
  { href: '/budget', label: 'Budget 2026', icon: DollarSign, moduleSlug: 'budget' },
  { href: '/meetings', label: 'Meetings', icon: Mic, moduleSlug: 'meetings' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, moduleSlug: 'calendar' },
  { href: '/documents', label: 'Documents', icon: FileText, moduleSlug: 'documents' },
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

// Roles that can see the admin section + full agency list
const ADMIN_ROLES = MINISTRY_ROLES;

export function Sidebar() {
  const pathname = usePathname();
  const { realUser, effectiveUser, isViewingAs } = useEffectiveUser();
  const [agenciesOpen, setAgenciesOpen] = useState(true);
  const [viewAsSelectorOpen, setViewAsSelectorOpen] = useState(false);
  const { mobileOpen, setMobileOpen, collapsed, toggleCollapse } = useSidebar();
  const { canAccess } = useModuleAccess();
  const { tooltip, onEnter, onLeave } = useTooltip();

  // Overdue task count for badge
  const [overdueCount, setOverdueCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function fetchOverdue() {
      try {
        const res = await fetch('/api/tasks/overdue-count');
        if (res.ok && !cancelled) {
          const { count } = await res.json();
          setOverdueCount(count ?? 0);
        }
      } catch { /* sidebar badge is supplementary */ }
    }
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Use effective user for rendering decisions
  const userRole = effectiveUser.role;
  const userAgency = effectiveUser.agency;
  const userName = effectiveUser.name;
  const roleLabel = ROLE_LABELS[userRole as keyof typeof ROLE_LABELS] || userRole;

  // Admin section: show if real user is admin OR effective user is admin
  // (DG always keeps admin access even when viewing as)
  const showAdmin = ADMIN_ROLES.includes(realUser.role) || ADMIN_ROLES.includes(userRole);
  const isMinistry = MINISTRY_ROLES.includes(userRole);
  const canViewAs = realUser.role === 'dg';

  // Agency users only see their own agency in the sidebar
  const visibleAgencies = isMinistry
    ? agencies
    : agencies.filter(a => a.code === userAgency?.toLowerCase());

  // Filter by module access
  const filteredMainNav = mainNavItems.filter(item => canAccess(item.moduleSlug));
  const filteredAgencies = visibleAgencies.filter(a => canAccess(a.moduleSlug));
  const filteredAdminItems = adminItems.filter(item => canAccess(item.moduleSlug));

  const gridHealthActive = pathname.startsWith('/pulse/gpl/grid-health');
  const airstripsActive = pathname.startsWith('/airstrips');

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
        className={`sidebar min-h-screen flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 md:static md:translate-x-0 sidebar-transition ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-16' : 'w-64'}`}
      >
        {/* Logo */}
        <div className={`${collapsed ? 'px-2 py-5' : 'px-6 py-5'} border-b border-navy-800/50 flex items-center justify-between transition-all duration-300`}>
          <Link href="/" className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`} onClick={handleNavClick}>
            <div className={`${collapsed ? 'w-10 h-10' : 'w-12 h-12'} rounded-full overflow-hidden ring-2 ring-gold-500/40 shadow-lg shadow-gold-500/10 shrink-0 transition-all duration-300`}>
              <Image
                src="/app-icon.png"
                alt="DG Work OS"
                width={48}
                height={48}
                priority
                className="w-full h-full object-cover"
              />
            </div>
            {!collapsed && (
              <div>
                <h1 className="font-bold text-white text-base leading-tight tracking-tight">Work <span className="text-gold-500">OS</span></h1>
                <p className="text-navy-600 text-xs font-medium tracking-wide uppercase">{roleLabel}</p>
              </div>
            )}
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-2.5 rounded-lg hover:bg-navy-800/50 text-navy-600 hover:text-white transition-colors touch-active"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 py-6 overflow-y-auto" role="navigation" aria-label="Main navigation">
          {!collapsed && (
            <div className="px-4 mb-2">
              <span className="text-navy-600 text-xs font-semibold uppercase tracking-wider">Main Menu</span>
            </div>
          )}
          {filteredMainNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const showOverdueBadge = item.href === '/tasks' && overdueCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={`sidebar-item ${active ? 'active' : ''} ${collapsed ? 'sidebar-item-collapsed' : ''}`}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                onMouseEnter={collapsed ? (e) => onEnter(item.label, e.currentTarget) : undefined}
                onMouseLeave={collapsed ? onLeave : undefined}
              >
                <span className="relative">
                  <Icon className={active ? 'text-gold-500' : ''} aria-hidden="true" />
                  {collapsed && showOverdueBadge && (
                    <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-scale-in" />
                  )}
                </span>
                {!collapsed && <span className="sidebar-label">{item.label}</span>}
                {!collapsed && showOverdueBadge && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500/90 px-1.5 text-[11px] font-semibold text-white animate-scale-in">
                    {overdueCount > 99 ? '99+' : overdueCount}
                  </span>
                )}
                {active && !collapsed && !showOverdueBadge && <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />}
              </Link>
            );
          })}

          {/* Agencies Section */}
          {(filteredAgencies.length > 0 || canAccess('airstrips')) && (
            <div className="mt-8">
              {!collapsed && (
                <button
                  onClick={() => setAgenciesOpen(!agenciesOpen)}
                  className="w-full px-4 mb-2 flex items-center justify-between"
                  aria-expanded={agenciesOpen}
                  aria-label="Agencies"
                >
                  <span className="text-navy-600 text-xs font-semibold uppercase tracking-wider">Agencies</span>
                  {agenciesOpen ? (
                    <ChevronDown className="h-3 w-3 text-navy-600" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-navy-600" aria-hidden="true" />
                  )}
                </button>
              )}
              {(agenciesOpen || collapsed) && (
                <div className="space-y-0.5">
                  {filteredAgencies.map((agency) => {
                    const Icon = agency.icon;
                    const href = `/intel/${agency.code}`;
                    const active = pathname.startsWith(href);
                    // When viewing Grid Health, don't highlight the GPL agency link
                    const showActive = active && !(agency.code === 'gpl' && gridHealthActive);
                    return (
                      <Fragment key={agency.code}>
                        <Link
                          href={href}
                          onClick={handleNavClick}
                          className={`sidebar-item ${showActive ? 'active' : ''} ${collapsed ? 'sidebar-item-collapsed' : ''}`}
                          {...(showActive ? { 'aria-current': 'page' as const } : {})}
                          onMouseEnter={collapsed ? (e) => onEnter(agency.label, e.currentTarget) : undefined}
                          onMouseLeave={collapsed ? onLeave : undefined}
                        >
                          <Icon className={`h-4 w-4 ${showActive ? 'text-gold-500' : ''}`} aria-hidden="true" />
                          {!collapsed && <span className="sidebar-label">{agency.label}</span>}
                          {!collapsed && <span className="ml-auto text-xs text-navy-600 hidden group-hover:inline">{agency.name}</span>}
                        </Link>
                        {agency.code === 'gpl' && canAccess('grid-health') && (
                          <Link
                            href="/pulse/gpl/grid-health"
                            onClick={handleNavClick}
                            className={`sidebar-item ${gridHealthActive ? 'active' : ''} ${collapsed ? 'sidebar-item-collapsed' : ''}`}
                            {...(gridHealthActive ? { 'aria-current': 'page' as const } : {})}
                            onMouseEnter={collapsed ? (e) => onEnter('Grid Health', e.currentTarget) : undefined}
                            onMouseLeave={collapsed ? onLeave : undefined}
                          >
                            <Gauge className={`h-4 w-4 ${gridHealthActive ? 'text-gold-500' : ''}`} aria-hidden="true" />
                            {!collapsed && <span className="sidebar-label">Grid Health</span>}
                          </Link>
                        )}
                      </Fragment>
                    );
                  })}
                  {canAccess('airstrips') && (
                    <Link
                      href="/airstrips"
                      onClick={handleNavClick}
                      className={`sidebar-item ${airstripsActive ? 'active' : ''} ${collapsed ? 'sidebar-item-collapsed' : ''}`}
                      {...(airstripsActive ? { 'aria-current': 'page' as const } : {})}
                      onMouseEnter={collapsed ? (e) => onEnter('Hinterland Airstrips', e.currentTarget) : undefined}
                      onMouseLeave={collapsed ? onLeave : undefined}
                    >
                      <PlaneLanding className={`h-4 w-4 ${airstripsActive ? 'text-gold-500' : ''}`} aria-hidden="true" />
                      {!collapsed && <span className="sidebar-label">Hinterland Airstrips</span>}
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Admin Section (DG, Minister, PS only) */}
          {showAdmin && filteredAdminItems.length > 0 && (
            <>
              {!collapsed && (
                <div className="mt-8 px-4 mb-2">
                  <span className="text-navy-600 text-xs font-semibold uppercase tracking-wider">Admin</span>
                </div>
              )}
              {collapsed && <div className="mt-4" />}
              {filteredAdminItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={`sidebar-item ${active ? 'active' : ''} ${collapsed ? 'sidebar-item-collapsed' : ''}`}
                    {...(active ? { 'aria-current': 'page' as const } : {})}
                    onMouseEnter={collapsed ? (e) => onEnter(item.label, e.currentTarget) : undefined}
                    onMouseLeave={collapsed ? onLeave : undefined}
                  >
                    <Icon className={active ? 'text-gold-500' : ''} aria-hidden="true" />
                    {!collapsed && <span className="sidebar-label">{item.label}</span>}
                  </Link>
                );
              })}
            </>
          )}

          {/* Collapse toggle (desktop only) */}
          <div className="hidden md:block mt-auto pt-4 px-2">
            <button
              onClick={toggleCollapse}
              className="sidebar-collapse-btn min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              <ChevronsLeft className={`h-4 w-4 sidebar-chevron ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-navy-800/50 space-y-3 transition-all duration-300`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isViewingAs ? 'bg-gradient-to-br from-amber-500 to-amber-600 ring-2 ring-amber-400/50' : 'bg-gradient-to-br from-[#d4af37] to-[#b8860b]'}`} title={userName}>
                <span className="text-navy-950 font-bold text-xs">{userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
              </div>
              {canViewAs && (
                <button
                  onClick={() => setViewAsSelectorOpen(true)}
                  className="p-2 rounded-lg text-navy-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="View As"
                  aria-label="View As another user"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <div className={`glass-card p-4 ${isViewingAs ? 'ring-1 ring-amber-500/40' : ''}`}>
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className={`text-xs ${isViewingAs ? 'text-amber-400' : 'text-gold-500'}`}>{roleLabel}</p>
                  {isViewingAs && (
                    <span className="text-[9px] font-semibold text-amber-400/80 uppercase">(View As)</span>
                  )}
                </div>
                {userAgency && (
                  <p className="text-xs text-navy-600 mt-0.5">{userAgency.toUpperCase()}</p>
                )}
              </div>
              {canViewAs && (
                <button
                  onClick={() => setViewAsSelectorOpen(true)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-navy-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors text-sm"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {isViewingAs ? 'Switch User' : 'View As'}
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign Out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* View As selector modal */}
      {canViewAs && (
        <ViewAsSelector isOpen={viewAsSelectorOpen} onClose={() => setViewAsSelectorOpen(false)} />
      )}

      {/* Tooltip portal for collapsed state */}
      {collapsed && tooltip && (
        <SidebarTooltip label={tooltip.label} anchorRect={tooltip.rect} />
      )}
    </>
  );
}
