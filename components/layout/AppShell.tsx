'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { MobileMenuButton } from './MobileMenuButton';
import { BottomNav } from './BottomNav';
import { HeaderDate } from './HeaderDate';
import { ChatButton } from '@/components/ai/ChatButton';
import { ActivityPanel } from './ActivityPanel';
import { ModuleGate } from './ModuleGate';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { PushPromptBanner } from '@/components/notifications/PushPromptBanner';
import { ToastProvider } from '@/components/ui/Toast';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { KeyboardShortcutsHelp } from '@/components/ui/KeyboardShortcutsHelp';


// Inner component that can use useSidebar (needs to be inside SidebarProvider)
function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { effectiveUser, isViewingAs } = useEffectiveUser();
  const { toggleCollapse, toggleRightCollapse, toggleFocusMode, focusMode } = useSidebar();
  const isBareLayout = pathname === '/login' || pathname.startsWith('/upload');

  const userName = effectiveUser.name;
  const userAgency = effectiveUser.agency;
  // Salutation: formal_title (Director General, CEO, Minister…) — never the
  // role label, which is a permission word. Fall back to the person's name.
  const greetingLabel = effectiveUser.title || userName;
  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Keyboard shortcuts: Cmd+[ (left), Cmd+] (right), Cmd+\ (focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === '[') {
        e.preventDefault();
        toggleCollapse();
      } else if (e.key === ']') {
        e.preventDefault();
        toggleRightCollapse();
      } else if (e.key === '\\') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCollapse, toggleRightCollapse, toggleFocusMode]);

  // Login and upload portal pages get bare layout — no sidebar, header, or bottom nav
  if (isBareLayout) {
    return <>{children}</>;
  }

  return (
    <NotificationProvider>
    <ToastProvider>
      <div className={`min-h-screen flex ${isViewingAs ? 'pt-10' : ''}`}>
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main id="main-content" className={`flex-1 min-h-screen min-w-0 main-content-transition ${focusMode ? 'focus-mode-enter' : ''}`}>
          {/* Top Bar */}
          <header className="h-14 md:h-16 border-b border-navy-800/50 bg-navy-950 md:bg-navy-950/80 md:backdrop-blur-sm sticky top-0 z-40">
            <div className="h-full px-3 md:px-8 flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <MobileMenuButton />
                <Image
                  src="/app-icon.png"
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-full ring-1 ring-gold-500/30 hidden sm:block"
                />
                {/* Desktop: full greeting */}
                <div className="hidden md:block">
                  <h2 className="text-white/80 text-sm font-light tracking-wide">Welcome back,</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-gold-500 font-semibold tracking-tight">{greetingLabel}</p>
                    {userAgency && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                        {userAgency.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                {/* Mobile: compact title */}
                <span className="md:hidden text-gold-500 font-semibold text-sm truncate">DG Work OS</span>
              </div>
              <div className="flex items-center space-x-3 md:space-x-4">
                <HeaderDate />
                <NotificationBell />
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center flex-shrink-0">
                  <span className="text-navy-950 font-bold text-xs md:text-sm">{initials}</span>
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-3 md:p-8 pb-24 md:pb-8">
            <ModuleGate>{children}</ModuleGate>
          </div>
        </main>

        {/* Activity Panel — Desktop only (xl+) */}
        <ActivityPanel />
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* AI Chat Button (every page except login) */}
      <ChatButton />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette />

      {/* Keyboard Shortcuts Help (Shift+?) */}
      <KeyboardShortcutsHelp />

      {/* Notification overlays */}
      <NotificationPanel />
      <NotificationToast />
      <PushPromptBanner />

      {/* Focus mode aria announcement */}
      <div aria-live="polite" className="sr-only">
        {focusMode ? 'Focus mode enabled — sidebars collapsed' : ''}
      </div>
    </ToastProvider>
    </NotificationProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}
