import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { BentoCard, CardHead } from '@/components/intel/common';

const PREVIEW_COUNT = 4;

const RISK_DOT: Record<DelayedProjectWithComputed['risk_tier'], string> = {
  HIGH: 'bg-red-400',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-emerald-500',
  NO_DATA: 'bg-navy-700',
};

interface ProjectsCardProps {
  items: DelayedProjectWithComputed[];
  href: string;
  className?: string;
  accent?: string;
}

export function ProjectsCard({ items, href, className, accent }: ProjectsCardProps) {
  const total = items.length;
  // Worst single overdue, not the sum: "1841d slip" summed across projects
  // is mathematically meaningless. Worst-offender is the right exec signal.
  const worst = items.reduce(
    (m, p) => Math.max(m, Math.max(0, p.days_overdue ?? 0)),
    0,
  );
  const overdueCount = items.filter((p) => (p.days_overdue ?? 0) > 0).length;
  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <BentoCard className={className} ariaLabel={`Projects: ${total} delayed`}>
      <CardHead
        icon={<AlertTriangle size={14} />}
        iconAccent={accent}
        title="Projects"
        right={
          <span className="text-[11px] tabular-nums">
            <span className="text-white font-semibold">{total}</span>
            {overdueCount > 0 && worst > 0 ? (
              <span className="text-amber-400"> · worst {worst}d</span>
            ) : null}
          </span>
        }
      />

      {total === 0 ? (
        <p className="text-xs text-navy-600 italic">No delayed projects.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0">
          {preview.map((p) => (
            <li key={p.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${
                  RISK_DOT[p.risk_tier] ?? 'bg-navy-700'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white leading-snug line-clamp-2">{p.project_name}</p>
                <p className="text-[11px] text-navy-600">
                  {typeof p.completion_percent === 'number'
                    ? `${Math.round(Number(p.completion_percent))}% complete`
                    : '— complete'}
                  {p.days_overdue != null && p.days_overdue > 0 ? (
                    <span> · {p.days_overdue}d overdue</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={href}
        className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
      >
        View all →
      </Link>
    </BentoCard>
  );
}
