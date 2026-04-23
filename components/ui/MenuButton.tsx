'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';

type IconType = ComponentType<{ className?: string }>;

export interface MenuItem {
  label: string;
  href?: string;
  icon?: IconType;
  onClick?: () => void;
}

interface MenuButtonProps {
  items: MenuItem[];
  ariaLabel?: string;
  className?: string;
}

export function MenuButton({ items, ariaLabel = 'More actions', className = '' }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center h-9 w-9 rounded-lg border border-navy-800 text-navy-600 hover:text-gold-500 hover:border-gold-500/30 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg border border-navy-800 bg-navy-900 shadow-xl z-50 py-1"
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            const content = (
              <span className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-navy-800 hover:text-gold-500 focus:bg-navy-800 focus:text-gold-500 focus:outline-none transition-colors">
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </span>
            );
            const setRef = (el: HTMLAnchorElement | HTMLButtonElement | null) => {
              if (idx === 0) firstItemRef.current = el;
            };
            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  ref={setRef}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                ref={setRef}
                onClick={() => { item.onClick?.(); setOpen(false); }}
                className="block w-full text-left"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
