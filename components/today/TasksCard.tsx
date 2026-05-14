'use client';

import Link from 'next/link';
import { CheckSquare } from 'lucide-react';
import type { TopTasks } from '@/lib/today/top-tasks';

interface TasksCardProps {
  tasks: TopTasks;
}

const PRIORITY_DOT_CLASS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-400',
  medium: 'bg-navy-600',
  low: 'bg-navy-700',
};

export function TasksCard({ tasks }: TasksCardProps) {
  const items = tasks.items ?? [];

  return (
    <article className="card-premium p-4 lg:p-5" aria-label="Open tasks">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare size={14} className="text-navy-600" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
            Tasks
          </span>
        </div>
        <Link href="/tasks" className="text-xs text-navy-600 hover:text-gold-500 transition-colors">
          View all
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No open tasks.</p>
      ) : (
        <ul className="space-y-3">
          {items.map(t => (
            <li key={t.id} className="flex items-start gap-2.5">
              <span
                className={`mt-1.5 block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT_CLASS[t.priority ?? 'low']}`}
                aria-hidden="true"
              />
              <Link href={`/tasks?task=${t.id}`} className="text-sm text-slate-300 hover:text-white transition-colors leading-snug">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
