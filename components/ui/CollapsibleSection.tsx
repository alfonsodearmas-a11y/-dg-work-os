'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  badge?: { text: string; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold' };
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  subtitle,
  badge,
  icon: Icon,
  defaultOpen = true,
  children,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-navy-800 bg-navy-900/50 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="collapsible-header w-full min-h-[48px]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <Icon size={18} className="text-gold-500 shrink-0" />}
          <span className="text-[15px] font-semibold text-white truncate">{title}</span>
          {subtitle && (
            <span className="text-xs text-navy-600 truncate hidden sm:inline">{subtitle}</span>
          )}
          {badge && (
            <Badge variant={badge.variant || 'default'}>{badge.text}</Badge>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-navy-600 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`collapse-grid ${isOpen ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
