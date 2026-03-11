'use client';

import { AlertTriangle } from 'lucide-react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-navy-900 rounded-lg ${className}`} />;
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

export function AgencyTag({ agency }: { agency: string | null }) {
  if (!agency) return null;
  return (
    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-navy-900 text-slate-400 border border-navy-800/50">
      {agency}
    </span>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 flex items-center gap-4">
      <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
      <p className="text-red-400 text-sm">{message}</p>
    </div>
  );
}
