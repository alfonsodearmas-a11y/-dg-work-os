'use client';

import { Eye, X } from 'lucide-react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { ROLE_LABELS } from '@/lib/people-types';

export function ViewAsBanner() {
  const { isViewingAs, viewAsTarget, stopViewAs } = useEffectiveUser();

  if (!isViewingAs || !viewAsTarget) return null;

  const roleLabel = ROLE_LABELS[viewAsTarget.role as keyof typeof ROLE_LABELS] || viewAsTarget.role;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-10 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 flex items-center justify-center gap-3 px-4 shadow-lg shadow-amber-500/20">
      <Eye className="h-4 w-4 text-navy-950 shrink-0" />
      <span className="text-navy-950 text-sm font-semibold truncate">
        Viewing as {viewAsTarget.name || viewAsTarget.email}
      </span>
      <span className="text-navy-950/70 text-xs font-medium px-1.5 py-0.5 rounded bg-navy-950/10 shrink-0">
        {roleLabel}
      </span>
      {viewAsTarget.agency && (
        <span className="text-navy-950/70 text-xs font-medium px-1.5 py-0.5 rounded bg-navy-950/10 shrink-0 uppercase">
          {viewAsTarget.agency}
        </span>
      )}
      <button
        onClick={stopViewAs}
        className="flex items-center gap-1.5 ml-2 px-3 py-1 rounded-full bg-navy-950/20 hover:bg-navy-950/30 text-navy-950 text-xs font-bold transition-colors shrink-0"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
