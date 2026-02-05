'use client';

import { Fragment } from 'react';

interface LoadingSkeletonProps {
  type?: 'card' | 'statusBar' | 'chart' | 'table' | 'briefing' | 'documentList' | 'projectCard';
  count?: number;
}

export function LoadingSkeleton({ type = 'card', count = 1 }: LoadingSkeletonProps) {
  const skeletons: Record<string, React.JSX.Element> = {
    card: (
      <div className="bg-[#1a2744] rounded-2xl p-6 border border-[#2d3a52] animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#2d3a52]" />
          <div className="flex-1">
            <div className="h-5 bg-[#2d3a52] rounded w-24 mb-2" />
            <div className="h-4 bg-[#2d3a52] rounded w-16" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="h-4 bg-[#2d3a52] rounded w-20" />
            <div className="h-4 bg-[#2d3a52] rounded w-16" />
          </div>
          <div className="flex justify-between">
            <div className="h-4 bg-[#2d3a52] rounded w-24" />
            <div className="h-4 bg-[#2d3a52] rounded w-12" />
          </div>
          <div className="flex justify-between">
            <div className="h-4 bg-[#2d3a52] rounded w-16" />
            <div className="h-4 bg-[#2d3a52] rounded w-20" />
          </div>
        </div>
      </div>
    ),
    statusBar: (
      <div className="bg-[#1a2744] rounded-2xl p-6 border border-[#2d3a52] animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 rounded-full bg-[#2d3a52]" />
            <div>
              <div className="h-6 bg-[#2d3a52] rounded w-48 mb-2" />
              <div className="h-4 bg-[#2d3a52] rounded w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-3 h-3 rounded-full bg-[#2d3a52]" />
            ))}
          </div>
        </div>
      </div>
    ),
    chart: (
      <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52] animate-pulse">
        <div className="h-5 bg-[#2d3a52] rounded w-32 mb-4" />
        <div className="h-64 bg-[#2d3a52]/50 rounded-lg" />
      </div>
    ),
    table: (
      <div className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52] animate-pulse">
        <div className="h-5 bg-[#2d3a52] rounded w-40 mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 bg-[#2d3a52] rounded flex-1" />
              <div className="h-4 bg-[#2d3a52] rounded w-20" />
              <div className="h-4 bg-[#2d3a52] rounded w-20" />
              <div className="h-4 bg-[#2d3a52] rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    ),
    briefing: (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#1a2744] rounded-2xl p-5 border border-[#2d3a52]">
              <div className="h-4 bg-[#2d3a52] rounded w-20 mb-3" />
              <div className="h-8 bg-[#2d3a52] rounded w-16" />
            </div>
          ))}
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-[#1a2744] rounded-xl p-6 border border-[#2d3a52]">
            <div className="h-5 bg-[#2d3a52] rounded w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-12 bg-[#2d3a52]/50 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
    documentList: (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#1a2744] rounded-xl p-4 border border-[#2d3a52] flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#2d3a52] shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-[#2d3a52] rounded w-48 mb-2" />
              <div className="h-3 bg-[#2d3a52] rounded w-32" />
            </div>
            <div className="flex gap-2">
              <div className="h-5 bg-[#2d3a52] rounded-full w-14" />
              <div className="h-5 bg-[#2d3a52] rounded-full w-10" />
            </div>
          </div>
        ))}
      </div>
    ),
    projectCard: (
      <div className="bg-[#1a2744] rounded-2xl p-5 border border-[#2d3a52] animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#2d3a52]" />
          <div className="flex-1">
            <div className="h-5 bg-[#2d3a52] rounded w-28 mb-2" />
            <div className="h-3 bg-[#2d3a52] rounded w-20" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-[#2d3a52] rounded w-16 mb-1" />
              <div className="h-5 bg-[#2d3a52] rounded w-10" />
            </div>
          ))}
        </div>
        <div className="h-2 bg-[#2d3a52] rounded-full" />
      </div>
    ),
  };

  return (
    <>
      {[...Array(count)].map((_, i) => (
        <Fragment key={i}>{skeletons[type]}</Fragment>
      ))}
    </>
  );
}
