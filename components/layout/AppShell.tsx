'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from './SidebarContext';
import { MobileMenuButton } from './MobileMenuButton';
import { BottomNav } from './BottomNav';
import { HeaderDate } from './HeaderDate';
import { ChatButton } from '@/components/ai/ChatButton';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { PushPromptBanner } from '@/components/notifications/PushPromptBanner';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  // Login page gets bare layout — no sidebar, header, or bottom nav
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
    <NotificationProvider>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 min-h-screen min-w-0">
          {/* Top Bar */}
          <header className="h-14 md:h-16 border-b border-[#2d3a52]/50 bg-[#0a1628] md:bg-[#0a1628]/80 md:backdrop-blur-sm sticky top-0 z-40">
            <div className="h-full px-3 md:px-8 flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <MobileMenuButton />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/app-icon.png"
                  alt=""
                  className="w-7 h-7 rounded-full ring-1 ring-[#d4af37]/30 hidden sm:block"
                />
                {/* Desktop: full greeting */}
                <div className="hidden md:block">
                  <h2 className="text-white/80 text-sm font-light tracking-wide">Welcome back,</h2>
                  <p className="text-[#d4af37] font-semibold tracking-tight">Director General</p>
                </div>
                {/* Mobile: compact title */}
                <span className="md:hidden text-[#d4af37] font-semibold text-sm truncate">DG Work OS</span>
              </div>
              <div className="flex items-center space-x-3 md:space-x-4">
                <HeaderDate />
                <NotificationBell />
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#0a1628] font-bold text-xs md:text-sm">AD</span>
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-3 md:p-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* AI Chat Button (every page except login) */}
      <ChatButton />

      {/* Notification overlays */}
      <NotificationPanel />
      <NotificationToast />
      <PushPromptBanner />
    </NotificationProvider>
    </SidebarProvider>
  );
}
