'use client';

import { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['\u2318', 'K'], description: 'Open command palette' },
  { keys: ['Shift', '?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close panel / deselect' },
  { keys: ['\u2191', '\u2193'], description: 'Navigate lists' },
  { keys: ['\u21B5'], description: 'Open selected item' },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-4 top-[20vh] z-[71] mx-auto max-w-md animate-fade-in">
        <div className="rounded-xl border border-navy-800 bg-navy-950 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-gold-500" />
              <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-navy-600 hover:text-white hover:bg-navy-900 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <span className="text-sm text-navy-400">{s.description}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((key, j) => (
                    <span key={j} className="inline-flex items-center">
                      <kbd className="inline-flex items-center justify-center min-w-[24px] rounded border border-navy-800 bg-navy-900 px-1.5 py-0.5 text-xs font-medium text-navy-400">
                        {key}
                      </kbd>
                      {j < s.keys.length - 1 && <span className="mx-0.5 text-navy-700">+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-navy-600">
            Shortcuts are disabled when typing in inputs.
          </p>
        </div>
      </div>
    </>
  );
}
