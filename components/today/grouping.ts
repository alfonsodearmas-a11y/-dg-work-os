import { AlertTriangle, CheckSquare, Clock, FileWarning, Pause, type LucideIcon } from 'lucide-react';
import type { TodaySignal, TodaySignalKind } from '@/lib/today/types';

export type GroupKey = Exclude<TodaySignalKind, 'agency_stagnant_rollup'>;

export const KIND_ORDER: readonly GroupKey[] = [
  'tender_sla',
  'delayed_project',
  'stagnant_tender',
  'incomplete_psip_data',
  'meeting_action',
] as const;

const GROUP_META: Record<GroupKey, { label: string; icon: LucideIcon }> = {
  tender_sla:           { label: 'Tender SLA Breaches',  icon: Clock },
  delayed_project:      { label: 'Delayed Projects',     icon: AlertTriangle },
  stagnant_tender:      { label: 'Stagnant Tenders',     icon: Pause },
  incomplete_psip_data: { label: 'Incomplete PSIP Data', icon: FileWarning },
  meeting_action:       { label: 'Meeting Actions',      icon: CheckSquare },
};

export interface GroupedSignal {
  key: GroupKey;
  label: string;
  icon: LucideIcon;
  items: TodaySignal[];
  rollupAwareCount: number;
}

function bucketFor(kind: TodaySignalKind): GroupKey {
  return kind === 'agency_stagnant_rollup' ? 'stagnant_tender' : kind;
}

export function groupSignals(signals: TodaySignal[]): GroupedSignal[] {
  const buckets = new Map<GroupKey, TodaySignal[]>();
  for (const s of signals) {
    const k = bucketFor(s.kind);
    const arr = buckets.get(k) ?? [];
    arr.push(s);
    buckets.set(k, arr);
  }

  const out: GroupedSignal[] = [];
  for (const key of KIND_ORDER) {
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    const meta = GROUP_META[key];
    const rollupAwareCount = items.reduce((sum, s) => sum + (s.rollupCount ?? 1), 0);
    out.push({ key, label: meta.label, icon: meta.icon, items, rollupAwareCount });
  }
  return out;
}
