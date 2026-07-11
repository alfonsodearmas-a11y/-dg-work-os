// Pure decision logic for scripts/opdirect-outbox-bridge.ts — no Playwright,
// no network, no env — so vitest can cover the idempotency and composition
// rules without a browser (scripts/opdirect-bridge-core.test.ts).

/** One row of GET /api/direct-outreach/outbox/export (status='pending'). */
export interface OutboxExportRow {
  id: string;
  case_id: number;
  dgos_ref: string;
  comment_text: string;
  op_status_target: string | null;
  author_label: string;
}

/** One entry of OP Direct's GET /api/cases/{id}/history (bare JSON array). */
export interface OpHistoryEntry {
  case_detail_id?: number | string | null;
  status_name?: string | null;
  comment?: string | null;
  username?: string | null;
  created_at?: string | null;
}

/** The exact comment line typed into OP Direct's required Comment box. */
export function buildOpComment(row: OutboxExportRow): string {
  return `[${row.dgos_ref}] ${row.author_label}: ${row.comment_text}`;
}

/** Defensive newest-first copy (the API returns newest first; don't rely on it). */
export function sortNewestFirst(history: OpHistoryEntry[]): OpHistoryEntry[] {
  return [...history].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : Number.NEGATIVE_INFINITY;
    const tb = b.created_at ? Date.parse(b.created_at) : Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
}

/** Case's current OP status = newest history entry's status-at-entry. */
export function currentOpStatus(history: OpHistoryEntry[]): string | null {
  for (const entry of sortNewestFirst(history)) {
    if (entry.status_name) return entry.status_name;
  }
  return null;
}

/** The history entry (if any) carrying this row's idempotency marker. */
export function findMarkerEntry(
  history: OpHistoryEntry[],
  dgosRef: string,
): OpHistoryEntry | undefined {
  const marker = `[${dgosRef}]`;
  return sortNewestFirst(history).find((entry) => entry.comment?.includes(marker));
}

export type RowPlan =
  | { action: 'ack'; opdirectCommentId: string | null }
  | { action: 'post' };

/**
 * Idempotency guard: if the marker is already in the case history AND there is
 * no status target (or OP already shows it), the row was posted by a previous
 * run whose ack never landed — ack it, don't re-post. Everything else posts.
 */
export function planForRow(row: OutboxExportRow, history: OpHistoryEntry[]): RowPlan {
  const marker = findMarkerEntry(history, row.dgos_ref);
  if (marker && (!row.op_status_target || currentOpStatus(history) === row.op_status_target)) {
    return {
      action: 'ack',
      opdirectCommentId: marker.case_detail_id != null ? String(marker.case_detail_id) : null,
    };
  }
  return { action: 'post' };
}

// ── Run summary ───────────────────────────────────────────────────────────────

export interface BridgeResultRow {
  caseId: number;
  dgosRef: string;
  outcome: 'posted' | 'already-posted' | 'failed' | 'dry-run';
  error?: string;
}

export function formatSummary(results: BridgeResultRow[]): string {
  const by = (outcome: BridgeResultRow['outcome']) => results.filter((r) => r.outcome === outcome);
  const ids = (rows: BridgeResultRow[]) => (rows.length ? ` (cases ${rows.map((r) => r.caseId).join(', ')})` : '');
  const posted = by('posted');
  const already = by('already-posted');
  const failed = by('failed');
  const dry = by('dry-run');
  const lines = [
    `posted: ${posted.length}${ids(posted)}`,
    `skipped (already in OP): ${already.length}${ids(already)}`,
    `failed: ${failed.length}${ids(failed)}`,
  ];
  if (dry.length) lines.push(`dry-run (not posted): ${dry.length}${ids(dry)}`);
  for (const f of failed) lines.push(`  case ${f.caseId} [${f.dgosRef}]: ${f.error}`);
  return lines.join('\n');
}
