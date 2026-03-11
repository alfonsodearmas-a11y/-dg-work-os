'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accentColor?: string;
  children: ReactNode;
}

export function SlidePanel({ isOpen, onClose, title, subtitle, icon: Icon, accentColor, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const focusable = panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      focusable?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[46] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-panel-title"
        className={`fixed inset-y-0 right-0 w-full sm:w-[600px] lg:w-[700px] bg-navy-950 border-l border-navy-800 z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-navy-900/95 backdrop-blur-sm border-b border-navy-800 px-4 md:px-6 py-3 md:py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2.5 -ml-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors lg:hidden touch-active"
                aria-label="Close panel"
              >
                <ArrowLeft size={20} />
              </button>
              {Icon && (
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${accentColor}`}>
                  <Icon className="text-white" size={22} aria-hidden="true" />
                </div>
              )}
              <div>
                <h2 id="slide-panel-title" className="text-xl font-bold text-white">{title}</h2>
                {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="hidden lg:flex p-2 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Close panel"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content — flex-1 + min-h-0 ensures proper overflow scrolling regardless of header height */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 md:p-6 pb-24 md:pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </div>
    </>
  );
}
