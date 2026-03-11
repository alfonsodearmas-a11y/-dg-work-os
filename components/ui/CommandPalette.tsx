'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, LayoutDashboard, Activity, CheckSquare, Eye,
  DollarSign, Mic, CalendarDays, FileText, Users, Settings,
  Zap, ArrowRight, Command,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: typeof Search;
  href?: string;
  action?: () => void;
  section: string;
  keywords?: string[];
}

const NAVIGATION_ITEMS: CommandItem[] = [
  { id: 'home', label: 'Mission Control', description: 'Daily briefing & dashboard', icon: LayoutDashboard, href: '/', section: 'Navigation', keywords: ['briefing', 'dashboard', 'home'] },
  { id: 'intel', label: 'Agency Intel', description: 'Agency overview & alerts', icon: Activity, href: '/intel', section: 'Navigation', keywords: ['agency', 'alerts', 'monitoring'] },
  { id: 'intel-gpl', label: 'GPL Deep Dive', description: 'Power & light metrics', icon: Zap, href: '/intel/gpl', section: 'Navigation', keywords: ['power', 'electricity', 'gpl', 'guyana power'] },
  { id: 'intel-cjia', label: 'CJIA Analytics', description: 'Airport passenger data', icon: Activity, href: '/intel/cjia', section: 'Navigation', keywords: ['airport', 'cjia', 'flights', 'passengers'] },
  { id: 'intel-gwi', label: 'GWI Metrics', description: 'Water utility data', icon: Activity, href: '/intel/gwi', section: 'Navigation', keywords: ['water', 'gwi'] },
  { id: 'intel-gcaa', label: 'GCAA Compliance', description: 'Aviation authority', icon: Activity, href: '/intel/gcaa', section: 'Navigation', keywords: ['aviation', 'gcaa', 'compliance'] },
  { id: 'tasks', label: 'Task Board', description: 'Kanban task management', icon: CheckSquare, href: '/tasks', section: 'Navigation', keywords: ['kanban', 'todo', 'tasks'] },
  { id: 'oversight', label: 'Oversight', description: 'Project monitoring', icon: Eye, href: '/oversight', section: 'Navigation', keywords: ['projects', 'monitoring', 'psip'] },
  { id: 'budget', label: 'Budget 2026', description: 'Budget estimates & analysis', icon: DollarSign, href: '/budget', section: 'Navigation', keywords: ['budget', 'finance', 'allocation'] },
  { id: 'meetings', label: 'Meetings', description: 'Meeting notes & transcripts', icon: Mic, href: '/meetings', section: 'Navigation', keywords: ['meeting', 'transcript', 'notes', 'recording'] },
  { id: 'calendar', label: 'Calendar', description: 'Google Calendar', icon: CalendarDays, href: '/calendar', section: 'Navigation', keywords: ['calendar', 'events', 'schedule'] },
  { id: 'documents', label: 'Documents', description: 'Document vault & AI search', icon: FileText, href: '/documents', section: 'Navigation', keywords: ['documents', 'files', 'vault', 'upload'] },
  { id: 'projects', label: 'Projects', description: 'PSIP project tracker', icon: Eye, href: '/projects', section: 'Navigation', keywords: ['projects', 'psip', 'tracker'] },
  { id: 'applications', label: 'Applications', description: 'Service applications', icon: FileText, href: '/applications', section: 'Navigation', keywords: ['applications', 'service', 'pending'] },
  { id: 'people', label: 'People', description: 'User management', icon: Users, href: '/admin/people', section: 'Admin', keywords: ['users', 'people', 'team', 'roles'] },
  { id: 'settings', label: 'Settings', description: 'App configuration', icon: Settings, href: '/admin', section: 'Admin', keywords: ['settings', 'admin', 'config'] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filtered = query.trim()
    ? NAVIGATION_ITEMS.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.keywords?.some((k) => k.includes(q))
        );
      })
    : NAVIGATION_ITEMS;

  const sections = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  const flatItems = Object.values(sections).flat();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-command-item]');
    items?.[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeItem = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.href) router.push(item.href);
      if (item.action) item.action();
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      executeItem(flatItems[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-x-4 top-[15vh] z-[71] mx-auto max-w-lg animate-fade-in">
        <div className="overflow-hidden rounded-xl border border-navy-800 bg-navy-950 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3 border-b border-navy-800 px-4">
            <Search className="h-5 w-5 shrink-0 text-navy-600" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, actions..."
              className="flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-navy-600"
            />
            <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-navy-800 px-1.5 py-0.5 text-[10px] text-navy-600">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
            {flatItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-navy-600">
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              Object.entries(sections).map(([section, items]) => (
                <div key={section}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-navy-600">
                    {section}
                  </div>
                  {items.map((item) => {
                    const globalIndex = flatItems.indexOf(item);
                    const Icon = item.icon;
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        data-command-item
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors
                          ${isSelected ? 'bg-gold-500/10 text-gold-500' : 'text-white hover:bg-navy-900'}
                        `}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-gold-500' : 'text-navy-600'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.label}</div>
                          {item.description && (
                            <div className="text-xs text-navy-600 truncate">{item.description}</div>
                          )}
                        </div>
                        {isSelected && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold-500" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-navy-800 px-4 py-2">
            <div className="flex items-center gap-3 text-[10px] text-navy-600">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-navy-800 px-1">&uarr;&darr;</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-navy-800 px-1">&crarr;</kbd> open
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-navy-600">
              <Command className="h-3 w-3" />K to toggle
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
