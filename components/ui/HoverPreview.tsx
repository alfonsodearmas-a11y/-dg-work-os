'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface HoverPreviewProps {
  children: ReactNode;
  preview: ReactNode;
  className?: string;
  delay?: number;
}

export function HoverPreview({ children, preview, className = '', delay = 400 }: HoverPreviewProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<'above' | 'below'>('below');
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosition(spaceBelow < 250 ? 'above' : 'below');
      }
      setShow(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {show && (
        <div
          className={`absolute left-0 z-50 w-72 animate-fade-in
            ${position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="rounded-xl border border-navy-800 bg-navy-950 p-4 shadow-xl shadow-black/30">
            {preview}
          </div>
        </div>
      )}
    </div>
  );
}
