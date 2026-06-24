import type { ParsedDelayedProject } from './upload-parser';

export const SNAPSHOT_CLEAR_THRESHOLD = 0.35;

export interface ExistingRow {
  id: string;
  source_id: number | null;
  project_reference: string;
  status: 'DELAYED' | 'RESOLVED';
  completion_percent: number;
  project_name: string;
  sub_agency: string;
}

export interface ReconcilePlan {
  guardTripped: boolean;
  activeDelayed: number;
  absentCount: number;
  absentFraction: number;
  toInsert: ParsedDelayedProject[];
  toUpdate: { existing: ExistingRow; incoming: ParsedDelayedProject; reopened: boolean }[];
  toResolveIds: string[];
  counts: { newCount: number; updatedCount: number; resolvedCount: number; reopenedCount: number };
}

export function planReconciliation(
  existing: ExistingRow[],
  incoming: ParsedDelayedProject[],
  confirmFullExport: boolean,
): ReconcilePlan {
  // Build lookup maps over existing rows
  const bySourceId = new Map<number, ExistingRow>();
  const byRef = new Map<string, ExistingRow>();
  for (const row of existing) {
    if (row.source_id !== null) bySourceId.set(row.source_id, row);
    byRef.set(row.project_reference.trim(), row);
  }

  // Build sets of what the upload covers (for absent computation)
  const incomingSourceIds = new Set<number>();
  const incomingRefs = new Set<string>();
  for (const row of incoming) {
    if (row.source_id !== null) incomingSourceIds.add(row.source_id);
    incomingRefs.add(row.project_reference.trim());
  }

  // Classify each incoming row as update or insert
  const toInsert: ParsedDelayedProject[] = [];
  const toUpdate: ReconcilePlan['toUpdate'] = [];
  const matchedExistingIds = new Set<string>();

  for (const row of incoming) {
    let matched: ExistingRow | undefined;
    if (row.source_id !== null) {
      matched = bySourceId.get(row.source_id);
    }
    if (!matched) {
      matched = byRef.get(row.project_reference.trim());
    }

    if (matched) {
      matchedExistingIds.add(matched.id);
      toUpdate.push({
        existing: matched,
        incoming: row,
        reopened: matched.status === 'RESOLVED',
      });
    } else {
      toInsert.push(row);
    }
  }

  // Guard + absent set: only DELAYED existing rows can be cleared
  const delayedRows = existing.filter((r) => r.status === 'DELAYED');
  const activeDelayed = delayedRows.length;

  const absentDelayedRows = delayedRows.filter((r) => {
    const inBySid = r.source_id !== null && incomingSourceIds.has(r.source_id);
    const inByRef = incomingRefs.has(r.project_reference.trim());
    return !inBySid && !inByRef;
  });
  const absentCount = absentDelayedRows.length;
  const absentFraction = activeDelayed > 0 ? absentCount / activeDelayed : 0;

  const guardTripped =
    activeDelayed > 0 && absentFraction > SNAPSHOT_CLEAR_THRESHOLD && !confirmFullExport;

  const toResolveIds = guardTripped ? [] : absentDelayedRows.map((r) => r.id);

  const newCount = toInsert.length;
  const updatedCount = toUpdate.filter((u) => !u.reopened).length;
  const reopenedCount = toUpdate.filter((u) => u.reopened).length;
  const resolvedCount = toResolveIds.length;

  return {
    guardTripped,
    activeDelayed,
    absentCount,
    absentFraction,
    toInsert,
    toUpdate,
    toResolveIds,
    counts: { newCount, updatedCount, resolvedCount, reopenedCount },
  };
}
