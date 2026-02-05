'use client';

import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function MobileMenuButton() {
  const { toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="md:hidden p-2 rounded-lg hover:bg-[#2d3a52]/50 text-[#94a3b8] hover:text-white transition-colors"
      aria-label="Open menu"
    >
      <Menu size={20} />
    </button>
  );
}
