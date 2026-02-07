'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { useSidebar } from './SidebarContext';

const tabs = [
  { href: '/', label: 'Briefing', icon: LayoutDashboard },
  { href: '/intel', label: 'Intel', icon: Activity },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/documents', label: 'Docs', icon: FileText },
];

export function BottomNav() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Check if we're on a page that doesn't match the main tabs (admin, etc.)
  const moreActive = !tabs.some(t => isActive(t.href));

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav-item ${active ? 'active' : ''}`}
          >
            <Icon />
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => setMobileOpen(true)}
        className={`bottom-nav-item ${moreActive ? 'active' : ''}`}
      >
        <MoreHorizontal />
        <span>More</span>
      </button>
    </nav>
  );
}
