'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function MobileMenuButton() {
  const { toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="md:hidden p-3 -ml-1 rounded-lg hover:bg-navy-800/50 text-slate-400 hover:text-white transition-colors touch-active"
      aria-label="Open menu"
    >
      <Menu size={22} />
    </button>
  );
}
