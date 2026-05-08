'use client';

import type { TodaySignal } from '@/lib/today/types';
import { agencyColor } from './agency-colors';

interface IssuesByAgencyCardProps {
  signals: TodaySignal[];
  topN?: number;
}

export function IssuesByAgencyCard({ signals, topN = 4 }: IssuesByAgencyCardProps) {
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (!s.agency) continue;
    counts.set(s.agency, (counts.get(s.agency) ?? 0) + (s.rollupCount ?? 1));
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const max = ranked[0]?.[1] ?? 1;

  return (
    <article className="card-premium p-4 lg:p-5" aria-label="Issues by agency">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600 mb-4">
        Issues by Agency
      </p>

      {ranked.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No active issues.</p>
      ) : (
        <ul className="space-y-3">
          {ranked.map(([agency, count]) => {
            const widthPct = Math.max(8, Math.round((count / max) * 100));
            const color = agencyColor(agency);
            return (
              <li key={agency} className="grid grid-cols-[56px_1fr_24px] items-center gap-3">
                <span
                  className="font-mono font-semibold text-xs tracking-wider"
                  style={{ color }}
                >
                  {agency}
                </span>
                <span className="h-1.5 rounded-full bg-navy-800 overflow-hidden">
                  <span
                    className="block h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${widthPct}%`, background: color }}
                  />
                </span>
                <span className="text-xs font-semibold text-slate-400 tabular-nums text-right">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
