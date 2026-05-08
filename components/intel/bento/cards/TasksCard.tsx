import Link from 'next/link';
import { CheckSquare } from 'lucide-react';
import type { AgencyOpenTask } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';
import { PRIORITY_DOT } from '@/lib/constants/task-styles';

const PREVIEW_COUNT = 4;

interface TasksCardProps {
  items: AgencyOpenTask[];
  href: string;
  className?: string;
  accent?: string;
}

function sortOpenTasks(a: AgencyOpenTask, b: AgencyOpenTask): number {
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function TasksCard({ items, href, className, accent }: TasksCardProps) {
  const sorted = [...items].sort(sortOpenTasks);
  const overdue = sorted.filter((t) => t.is_overdue).length;
  const total = sorted.length;
  const preview = sorted.slice(0, PREVIEW_COUNT);

  return (
    <BentoCard className={className} ariaLabel={`Open tasks: ${total}`}>
      <CardHead
        icon={<CheckSquare size={14} />}
        iconAccent={accent}
        title="Open Tasks"
        right={
          <span className="text-[11px] tabular-nums text-navy-600">
            {overdue > 0 ? (
              <>
                <span className="text-red-400 font-semibold">{overdue}</span>
                <span> overdue · </span>
              </>
            ) : null}
            <span className="text-white">{total}</span>
          </span>
        }
      />

      {total === 0 ? (
        <p className="text-xs text-navy-600 italic">No open tasks.</p>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0">
          {preview.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 min-w-0">
              <span
                className={`mt-1.5 inline-flex h-2 w-2 rounded-full shrink-0 ${
                  (t.priority && PRIORITY_DOT[t.priority]) || 'bg-navy-700'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate leading-snug">{t.title}</p>
                <p className="text-[11px] text-navy-600">
                  {t.due_date ? (
                    <span className={t.is_overdue ? 'text-red-400' : ''}>
                      due {t.due_date}
                      {t.is_overdue ? ' (overdue)' : ''}
                    </span>
                  ) : (
                    <span>no due date</span>
                  )}
                  {t.owner_name ? <span> · {t.owner_name}</span> : null}
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
