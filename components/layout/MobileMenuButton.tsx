'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function MobileMenuButton() {
  const { toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="md:hidden p-2.5 -ml-1 rounded-lg hover:bg-[#2d3a52]/50 text-[#94a3b8] hover:text-white transition-colors touch-active"
      aria-label="Open menu"
    >
      <Menu size={22} />
    </button>
  );
}
