'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, ListTodo, LogOut, Bell, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { TaskNotificationBell } from '@/components/tasks/TaskNotificationBell';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/tasks', label: 'My Tasks', icon: ListTodo },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?mode=user');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0a1628] flex">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`w-64 min-h-screen flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 bg-[#0f1d32] border-r border-[#2d3a52]/50 transition-transform duration-300 md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-[#2d3a52]/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-[#d4af37]/40 shrink-0">
              <Image src="/app-icon.png" alt="DG Work OS" width={40} height={40} priority className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">Work <span className="text-[#d4af37]">OS</span></h1>
              <p className="text-[#64748b] text-[10px] uppercase tracking-wide">Agency Portal</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-2 text-[#64748b] hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-6">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <Icon className={active ? 'text-[#d4af37]' : ''} />
                <span className="text-[15px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2d3a52]/50 space-y-3">
          <div className="glass-card p-3">
            <p className="text-xs text-[#64748b]">{user.agency?.toUpperCase()}</p>
            <p className="text-sm font-medium text-white">{user.fullName}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[#0a1628]/80 backdrop-blur-md border-b border-[#2d3a52]/50">
          <div className="flex items-center justify-between px-4 md:px-6 h-14">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 text-[#64748b] hover:text-white">
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:block" />
            <TaskNotificationBell basePath="/dashboard" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
