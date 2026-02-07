'use client';

import { useEffect, ReactNode } from 'react';
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
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[600px] lg:w-[700px] bg-[#0a1628] border-l border-[#2d3a52] z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#1a2744]/95 backdrop-blur-sm border-b border-[#2d3a52] px-4 md:px-6 py-3 md:py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              <button
                onClick={onClose}
                className="p-2.5 -ml-2 rounded-lg hover:bg-[#2d3a52] text-[#94a3b8] hover:text-white transition-colors lg:hidden touch-active"
              >
                <ArrowLeft size={20} />
              </button>
              {Icon && (
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${accentColor}`}>
                  <Icon className="text-white" size={22} />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-white">{title}</h2>
                {subtitle && <p className="text-[#94a3b8] text-sm">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="hidden lg:flex p-2 rounded-lg hover:bg-[#2d3a52] text-[#94a3b8] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-73px)] overflow-y-auto overflow-x-hidden p-3 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </div>
    </>
  );
}
