'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface SidebarContextType {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  mobileOpen: false,
  setMobileOpen: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen, toggle: () => setMobileOpen(v => !v) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
