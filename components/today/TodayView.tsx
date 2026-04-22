'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { TodaySignalCard } from './TodaySignalCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TodayPayload } from '@/lib/today/types';

const SOURCE_LABEL: Record<keyof TodayPayload['sources'], string> = {
  delayed_projects: 'delayed projects',
  tenders: 'procurement',
  meeting_actions: 'meeting actions',
  stagnant_tenders: 'stagnant tenders',
};

function formatToday(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function TodayView({ payload, userName }: { payload: TodayPayload; userName: string | null | undefined }) {
  const { signals, counts, sources, generatedAt } = payload;
  const unhealthySources = Object.entries(sources)
    .filter(([, v]) => !v.ok)
    .map(([k]) => SOURCE_LABEL[k as keyof TodayPayload['sources']]);

  const firstName = userName?.split(' ')[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-navy-600">{formatToday(generatedAt)}</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          {firstName ? `Good morning, ${firstName}` : 'Today'}
        </h1>
        <p className="mt-1 text-sm text-navy-600">
          {counts.total === 0
            ? 'Nothing needs your attention right now.'
            : `${counts.total} ${counts.total === 1 ? 'item needs' : 'items need'} your attention.`}
        </p>
      </header>

      {unhealthySources.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Partial data</p>
            <p className="text-red-300/80">
              Could not load: {unhealthySources.join(', ')}. Other sources shown below.
            </p>
          </div>
        </div>
      )}

      {signals.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10" />}
          title="All clear"
          description="No overdue projects, SLA breaches, or open action items. Check back later."
        />
      ) : (
        <div className="space-y-2">
          {signals.map((s) => (
            <TodaySignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}
