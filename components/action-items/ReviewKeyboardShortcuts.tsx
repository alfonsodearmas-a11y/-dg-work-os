'use client';
import { useEffect, useState } from 'react';

export function ReviewKeyboardShortcuts({ onAcceptAll, onSubmit }: { onAcceptAll: () => void; onSubmit: () => void }) {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === '?') setHelp(h => !h);
      if (e.key === 'A') onAcceptAll();
      if (e.metaKey && e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAcceptAll, onSubmit]);

  if (!help) return null;
  return (
    <div className="fixed bottom-4 right-4 bg-navy-900 border border-navy-800 rounded-lg p-3 text-xs">
      <div className="font-semibold mb-1">Shortcuts</div>
      <div>?  toggle help</div>
      <div>A  accept all in bucket</div>
      <div>⌘↵ submit decisions</div>
      <div>(J/K, E, R wired in Plan 4.1)</div>
    </div>
  );
}
