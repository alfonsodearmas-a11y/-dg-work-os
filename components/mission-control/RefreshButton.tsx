'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    // Ensure spin animation runs at least 800ms for visual feedback
    setTimeout(() => setSpinning(false), 800);
  };

  const isActive = isPending || spinning;

  return (
    <button
      onClick={handleRefresh}
      disabled={isActive}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37]/50 transition-colors text-sm text-[#94a3b8] hover:text-white disabled:opacity-60"
    >
      <RefreshCw
        size={14}
        className={isActive ? 'animate-spin' : ''}
      />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}
