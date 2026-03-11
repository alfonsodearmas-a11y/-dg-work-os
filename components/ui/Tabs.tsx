'use client';

import { useRef, useCallback, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  children?: ReactNode;
  compactOnMobile?: boolean;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, children, compactOnMobile = false, className = '' }: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      let nextIndex = currentIndex;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      onChange(tabs[nextIndex].id);

      const buttons = tabListRef.current?.querySelectorAll('[role="tab"]');
      (buttons?.[nextIndex] as HTMLElement)?.focus();
    },
    [tabs, activeTab, onChange]
  );

  return (
    <div className={className}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex items-center gap-1 border-b border-navy-800 pb-0"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              title={compactOnMobile ? tab.label : undefined}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg shrink-0
                ${isActive
                  ? 'text-gold-500 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gold-500'
                  : 'text-navy-600 hover:text-white'
                }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
                {tab.label}
              </span>
              {tab.badge != null && tab.badge > 0 && (
                <span className={`ml-1 min-w-[18px] rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                  ${isActive ? 'bg-gold-500/20 text-gold-500' : 'bg-navy-800 text-navy-600'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {children && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          {children}
        </div>
      )}
    </div>
  );
}
