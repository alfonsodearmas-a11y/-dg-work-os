'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

// Dynamically import ChatPanel to keep it out of the main bundle
const ChatPanel = dynamic(() => import('./ChatPanel').then(m => ({ default: m.ChatPanel })), {
  ssr: false,
});

export function ChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const pathname = usePathname();
  const isMobile = useIsMobile();

  // Don't show on login page
  if (pathname === '/login') return null;

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleMinimize = useCallback(() => setIsOpen(false), []);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`fixed z-[9998] flex items-center justify-center transition-all duration-200 ease-out group ${
            isMobile
              ? 'right-4 bottom-20'
              : 'right-6 bottom-6'
          } ${
            isHovered && !isMobile
              ? 'w-[200px] h-12 rounded-full'
              : 'w-14 h-14 rounded-full'
          }`}
          style={{
            background: 'linear-gradient(135deg, #d4af37, #c4a030)',
            boxShadow: '0 4px 20px rgba(212, 175, 55, 0.3)',
            animation: 'chatFabPulse 10s ease-in-out infinite',
          }}
          title={`Ask AI (${navigator?.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K)`}
        >
          <Sparkles className={`text-white transition-all duration-200 ${isHovered && !isMobile ? 'h-5 w-5' : 'h-6 w-6'}`} />
          {isHovered && !isMobile && (
            <span className="ml-2 text-white text-sm font-medium whitespace-nowrap overflow-hidden" style={{ animation: 'chatFabTextIn 200ms ease-out' }}>
              Ask anything...
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <ChatPanel
          isOpen={isOpen}
          onClose={handleClose}
          onMinimize={handleMinimize}
        />
      )}

      {/* Button animations */}
      <style jsx global>{`
        @keyframes chatFabPulse {
          0%, 90%, 100% {
            box-shadow: 0 4px 20px rgba(212, 175, 55, 0.3);
          }
          95% {
            box-shadow: 0 4px 40px rgba(212, 175, 55, 0.5), 0 0 60px rgba(212, 175, 55, 0.15);
          }
        }
        @keyframes chatFabTextIn {
          from { opacity: 0; max-width: 0; }
          to { opacity: 1; max-width: 200px; }
        }
      `}</style>
    </>
  );
}
