import 'server-only';
import { supabaseAdmin } from '@/lib/db-admin';
import type { MeetingType, Modality } from '@/lib/action-items/constants';

export interface CounterInput {
  extracted: number;
  accepted: number;
  edited: number;
  rejected: number;
  accepted_owner_kept: number;
  hi_conf_rejected_or_owner_edited: number;
  hi_conf_total: number;
}
export interface EvalMetrics extends CounterInput {
  recall: number;
  precision: number;
  owner_accuracy: number;
  overconfidence_rate: number;
  passes_thresholds: boolean;
}

const THRESHOLDS = { recall: 0.95, precision: 0.90, owner_accuracy: 0.90, overconfidence_rate: 0.03 };

export function computeMetricsFromCounters(c: CounterInput): EvalMetrics {
  const recall    = c.extracted > 0 ? c.accepted / c.extracted : 0;
  const precision = c.accepted > 0 ? (c.accepted - c.edited) / c.accepted : 0;
  const owner_accuracy = c.accepted > 0 ? c.accepted_owner_kept / c.accepted : 0;
  const overconfidence_rate = c.hi_conf_total > 0 ? c.hi_conf_rejected_or_owner_edited / c.hi_conf_total : 0;
  const passes_thresholds =
    recall >= THRESHOLDS.recall &&
    precision >= THRESHOLDS.precision &&
    owner_accuracy >= THRESHOLDS.owner_accuracy &&
    overconfidence_rate <= THRESHOLDS.overconfidence_rate;
  return { ...c, recall, precision, owner_accuracy, overconfidence_rate, passes_thresholds };
}

export async function computeEvalMetrics(
  meetingType: MeetingType, modality: Modality, windowSize = 20,
): Promise<EvalMetrics> {
  const { data: ex } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, items_extracted, items_accepted, items_edited, items_rejected')
    .eq('meeting_type', meetingType)
    .eq('modality', modality)
    .eq('review_status', 'complete')
    .order('reviewed_at', { ascending: false })
    .limit(windowSize);
  const window = (ex ?? []) as Array<{
    id: string; items_extracted: number; items_accepted: number;
    items_edited: number; items_rejected: number;
  }>;
  const ids = window.map(e => e.id);

  const counters: CounterInput = {
    extracted: window.reduce((s, e) => s + (e.items_extracted ?? 0), 0),
    accepted:  window.reduce((s, e) => s + (e.items_accepted ?? 0), 0),
    edited:    window.reduce((s, e) => s + (e.items_edited ?? 0), 0),
    rejected:  window.reduce((s, e) => s + (e.items_rejected ?? 0), 0),
    accepted_owner_kept: 0,
    hi_conf_rejected_or_owner_edited: 0,
    hi_conf_total: 0,
  };

  if (ids.length > 0) {
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, extraction_id, confidence_overall')
      .in('extraction_id', ids);
    const taskRows = (tasks ?? []) as Array<{ id: string; extraction_id: string; confidence_overall: number | null }>;
    for (const t of taskRows) {
      const conf = t.confidence_overall ?? 0;
      if (conf >= 0.9) counters.hi_conf_total++;
    }
    const taskIds = taskRows.map(t => t.id);
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('task_id, event_type, payload')
      .in('task_id', taskIds.length ? taskIds : ['00000000-0000-0000-0000-000000000000']);
    const editedOwners = new Set<string>();
    const eventRows = (events ?? []) as Array<{ task_id: string; event_type: string; payload: { fields_changed?: string[] } | null }>;
    for (const e of eventRows) {
      if (e.event_type === 'edited' && (e.payload?.fields_changed ?? []).includes('owner_user_id')) {
        editedOwners.add(e.task_id);
      }
    }
    for (const t of taskRows) {
      if (!editedOwners.has(t.id)) counters.accepted_owner_kept++;
      const conf = t.confidence_overall ?? 0;
      if (conf >= 0.9 && editedOwners.has(t.id)) counters.hi_conf_rejected_or_owner_edited++;
    }
  }
  return computeMetricsFromCounters(counters);
}
