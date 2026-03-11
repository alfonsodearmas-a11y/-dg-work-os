'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

interface SidebarContextType {
  // Left sidebar
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
  collapsed: boolean;
  toggleCollapse: () => void;
  // Right sidebar
  rightCollapsed: boolean;
  toggleRightCollapse: () => void;
  // Right sidebar mobile drawer
  rightMobileOpen: boolean;
  setRightMobileOpen: (open: boolean) => void;
  // Focus mode
  focusMode: boolean;
  toggleFocusMode: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  mobileOpen: false,
  setMobileOpen: () => {},
  toggle: () => {},
  collapsed: false,
  toggleCollapse: () => {},
  rightCollapsed: false,
  toggleRightCollapse: () => {},
  rightMobileOpen: false,
  setRightMobileOpen: () => {},
  focusMode: false,
  toggleFocusMode: () => {},
});

const LS_LEFT = 'dg-left-sidebar-collapsed';
const LS_RIGHT = 'dg-right-sidebar-collapsed';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightMobileOpen, setRightMobileOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Remember pre-focus-mode states so we can restore them
  const preFocusRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  // Hydrate from localStorage + responsive defaults
  useEffect(() => {
    const savedLeft = localStorage.getItem(LS_LEFT);
    const savedRight = localStorage.getItem(LS_RIGHT);
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1280;

    // Tablet defaults: left collapsed, right hidden
    if (savedLeft !== null) {
      setCollapsed(savedLeft === 'true');
    } else if (isTablet) {
      setCollapsed(true);
    }

    if (savedRight !== null) {
      setRightCollapsed(savedRight === 'true');
    } else if (isTablet) {
      setRightCollapsed(true);
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_LEFT, String(next));
      return next;
    });
    // Exiting focus mode if we manually toggle a sidebar
    if (focusMode) setFocusMode(false);
  }, [focusMode]);

  const toggleRightCollapse = useCallback(() => {
    setRightCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_RIGHT, String(next));
      return next;
    });
    if (focusMode) setFocusMode(false);
  }, [focusMode]);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      if (!prev) {
        // Entering focus mode — save current states, collapse both
        preFocusRef.current = { left: collapsed, right: rightCollapsed };
        setCollapsed(true);
        setRightCollapsed(true);
        localStorage.setItem(LS_LEFT, 'true');
        localStorage.setItem(LS_RIGHT, 'true');
      } else {
        // Exiting focus mode — restore previous states
        const { left, right } = preFocusRef.current;
        setCollapsed(left);
        setRightCollapsed(right);
        localStorage.setItem(LS_LEFT, String(left));
        localStorage.setItem(LS_RIGHT, String(right));
      }
      return !prev;
    });
  }, [collapsed, rightCollapsed]);

  return (
    <SidebarContext.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggle: () => setMobileOpen(v => !v),
        collapsed,
        toggleCollapse,
        rightCollapsed,
        toggleRightCollapse,
        rightMobileOpen,
        setRightMobileOpen,
        focusMode,
        toggleFocusMode,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
