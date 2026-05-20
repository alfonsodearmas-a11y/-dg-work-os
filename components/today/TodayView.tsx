import { AlertCircle } from 'lucide-react';
import type { TodayPayload, TodaySignal, TodaySourceHealth } from '@/lib/today/types';
import type { SlaSummary } from '@/lib/today/sla-summary';
import type { CalendarToday } from '@/lib/today/schedule';
import type { TopTasks } from '@/lib/today/top-tasks';
import { UrgentHero } from './UrgentHero';
import { StatSummaryCard } from './StatSummaryCard';
import { IssuesByAgencyCard } from './IssuesByAgencyCard';
import { TodaysScheduleCard } from './TodaysScheduleCard';
import { TasksCard } from './TasksCard';
import { GreetingHeading } from './GreetingHeading';

interface TodayViewProps {
  payload: TodayPayload;
  sla: SlaSummary;
  schedule: CalendarToday;
  tasks: TopTasks;
  userName: string | null;
}

const SOURCE_LABELS: Record<keyof TodayPayload['sources'], string> = {
  delayed_projects: 'delayed projects',
  tenders: 'tenders',
  meeting_actions: 'meeting actions',
  stagnant_tenders: 'stagnant tenders',
  incomplete_psip: 'PSIP completeness',
};

function formatBriefingDate(now: Date): string {
  return now
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}

function firstName(userName: string | null): string {
  if (!userName) return 'there';
  return userName.split(/\s+/)[0] ?? userName;
}

function pickTopUrgent(signals: TodaySignal[]): TodaySignal | null {
  const slaSignals = signals.filter(s => s.kind === 'tender_sla');
  const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  const sorted = slaSignals.sort((a, b) => {
    const r = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
    if (r !== 0) return r;
    return (b.ageDays ?? 0) - (a.ageDays ?? 0);
  });
  return sorted[0] ?? null;
}

function agencyBreachCounts(signals: TodaySignal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of signals) {
    if (s.kind !== 'tender_sla' || !s.agency) continue;
    m.set(s.agency, (m.get(s.agency) ?? 0) + 1);
  }
  return m;
}

function unhealthySources(sources: TodayPayload['sources']): string[] {
  const out: string[] = [];
  for (const [key, val] of Object.entries(sources) as Array<[keyof TodayPayload['sources'], TodaySourceHealth]>) {
    if (!val.ok) out.push(SOURCE_LABELS[key]);
  }
  return out;
}

export function TodayView({ payload, sla, schedule, tasks, userName }: TodayViewProps) {
  const top = pickTopUrgent(payload.signals);
  const agencyBreaches = agencyBreachCounts(payload.signals);
  const unhealthy = unhealthySources(payload.sources);
  const dateLine = formatBriefingDate(new Date(payload.generatedAt));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {dateLine} · DG Briefing
        </p>
        <GreetingHeading userName={firstName(userName)} />
      </header>

      {unhealthy.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-amber-400">
            Some signals are stale: {unhealthy.join(', ')}. Numbers below may be incomplete.
          </p>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
        <div className="md:col-span-2 xl:col-span-2 xl:row-span-2 min-h-[420px]">
          <UrgentHero topSignal={top} sla={sla} agencyBreaches={agencyBreaches} />
        </div>

        <StatSummaryCard kind="tender_sla" signals={payload.signals} />
        <StatSummaryCard kind="delayed_project" signals={payload.signals} />
        <StatSummaryCard kind="incomplete_psip_data" signals={payload.signals} />
        <IssuesByAgencyCard signals={payload.signals} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <div className="lg:col-span-2">
          <TodaysScheduleCard schedule={schedule} />
        </div>
        <TasksCard tasks={tasks} />
      </section>
    </div>
  );
}
