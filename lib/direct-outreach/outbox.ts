// Direct Outreach — OP Direct write-back outbox (server-only).
//
// RULE (docs: scripts/opdirect-outbox-bridge.README.md): every Direct Outreach
// mutation — officer assignment/unassignment (including the clear a transfer
// performs), working-status change, remark, target-date change — enqueues ONE
// direct_outreach_opdirect_outbox row IN THE SAME TRANSACTION as the underlying
// change (enqueueOutboxRow takes the caller's PoolClient for exactly that
// reason). A local, session-bound bridge (scripts/opdirect-outbox-bridge.ts)
// posts each row to OP Direct as a case comment; when op_status_target is set
// the bridge also sets that status in the same save (OP's Update form requires
// a comment, so status+comment go together).

import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { query } from '@/lib/db-pg';
import {
  OUTREACH_WORKING_STATUS_LABELS,
  type OutreachOutboxSourceKind,
  type OutreachOutboxStatus,
  type OutreachWorkingStatus,
} from './types';

/**
 * THE status map — the single explicit DG→OP constant. A working status listed
 * here makes the bridge set that OP Direct status NAME in the same save as the
 * comment; every other DG status is comment-only. Category is never changed.
 */
export const OP_STATUS_TARGETS: Partial<Record<OutreachWorkingStatus, string>> = {
  resolved_pending_verification: 'Resolved',
};

/** Route-param guard shared by the [id] transition routes. */
export const OUTBOX_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Enqueue (always inside the caller's transaction) ─────────────────────────

export interface OutboxEnqueue {
  caseId: number;
  sourceKind: OutreachOutboxSourceKind;
  /** direct_outreach_officer_updates.id when the row mirrors a log entry (by value, no FK). */
  officerUpdateId?: string | null;
  commentText: string;
  opStatusTarget?: string | null;
  authorUserId: string;
  authorLabel: string;
}

/**
 * Insert one outbox row on the caller's transaction client. id and dgos_ref
 * ('DGOS-'||id) are minted from the same uuid, so ref and pk can never disagree.
 */
export async function enqueueOutboxRow(client: PoolClient, input: OutboxEnqueue): Promise<void> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO direct_outreach_opdirect_outbox
       (id, case_id, source_kind, officer_update_id, dgos_ref, comment_text,
        op_status_target, author_user_id, author_label)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8::uuid, $9)`,
    [
      id,
      input.caseId,
      input.sourceKind,
      input.officerUpdateId ?? null,
      `DGOS-${id}`,
      input.commentText,
      input.opStatusTarget ?? null,
      input.authorUserId,
      input.authorLabel,
    ],
  );
}

// ── Officer-update composition ────────────────────────────────────────────────

export interface OfficerUpdateOutboxParts {
  /** Remark with @[uuid] mentions ALREADY resolved to plain @Name text. */
  body: string | null;
  workingStatus: OutreachWorkingStatus | null;
  /** undefined = untouched, null = cleared, string (YYYY-MM-DD) = set. */
  targetDate: string | null | undefined;
}

export interface ComposedOutboxEntry {
  sourceKind: OutreachOutboxSourceKind;
  commentText: string;
  opStatusTarget: string | null;
}

/**
 * One officer update = one outbox row = one OP comment, combining whatever the
 * update carried: the remark verbatim, then "Status -> {label}", then
 * "Target date -> {date}" / "Target date cleared". source_kind records the
 * weightiest change (status > remark > target). Returns null for an empty
 * update (the route's schema already rejects those).
 */
export function composeOfficerUpdateOutbox(parts: OfficerUpdateOutboxParts): ComposedOutboxEntry | null {
  const pieces: string[] = [];
  if (parts.body && parts.body.trim()) pieces.push(parts.body.trim());
  if (parts.workingStatus) {
    pieces.push(`Status -> ${OUTREACH_WORKING_STATUS_LABELS[parts.workingStatus]}`);
  }
  if (parts.targetDate === null) pieces.push('Target date cleared');
  else if (typeof parts.targetDate === 'string') pieces.push(`Target date -> ${parts.targetDate}`);
  if (pieces.length === 0) return null;

  return {
    sourceKind: parts.workingStatus ? 'status' : parts.body?.trim() ? 'remark' : 'target',
    commentText: pieces.join(' · '),
    opStatusTarget: parts.workingStatus ? (OP_STATUS_TARGETS[parts.workingStatus] ?? null) : null,
  };
}

// ── Mention resolution for outbound comments ─────────────────────────────────

// STRICT canonical uuid inside @[…] — deliberately tighter than the loose
// 36-char class in lib/notifications/mention-utils.ts: these captures are cast
// to ::uuid[] in SQL, so a sloppy match (e.g. 36 hex chars, no hyphens) must be
// left as literal text instead of aborting the caller's write with 22P02.
const MENTION_RE = /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

/**
 * Replace @[uuid] mentions with plain @Name for the OP Direct comment. Unlike
 * cleanMentionBody (notifications, 140-char truncation) this keeps the full
 * remark. Runs on the pool — the names need no transactional consistency, so
 * callers resolve BEFORE opening their write transaction.
 */
export async function resolveMentionsForOutbox(body: string): Promise<string> {
  const ids = [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))];
  if (ids.length === 0) return body;
  const result = await query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [ids]);
  const names = new Map<string, string>(
    (result.rows as { id: string; name: string | null }[]).map((r) => [r.id.toLowerCase(), r.name || 'User']),
  );
  // Postgres returns canonical-lowercase ids; the body may carry uppercase.
  return body.replace(MENTION_RE, (_, uid: string) => `@${names.get(uid.toLowerCase()) || 'User'}`);
}

// ── Status transitions (raw db-pg; guarded by current status) ────────────────

export type OutboxTransitionResult =
  | { applied: true }
  | { applied: false; current: OutreachOutboxStatus }
  | { applied: false; current: null }; // row does not exist

/**
 * One round trip: attempt the guarded transition and, when it doesn't apply,
 * report the row's current status (or null when the id is unknown) from the
 * same statement — no separate existence probe, no read-after-write race.
 */
async function applyOutboxTransition(
  id: string,
  fromStatuses: OutreachOutboxStatus[],
  setSql: string,
  setParams: unknown[],
): Promise<OutboxTransitionResult> {
  // $1 = id, $2 = allowed from-statuses; SET params start at $3.
  const offset = 3;
  const sets = setSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset - 1}`);
  const result = await query(
    `WITH target AS (
       SELECT id, status FROM direct_outreach_opdirect_outbox WHERE id = $1
     ), upd AS (
       UPDATE direct_outreach_opdirect_outbox
          SET ${sets}
        WHERE id = $1 AND status = ANY($2::text[])
        RETURNING id
     )
     SELECT t.status AS current, (u.id IS NOT NULL) AS applied
       FROM target t LEFT JOIN upd u ON u.id = t.id`,
    [id, fromStatuses, ...setParams],
  );
  const row = result.rows[0] as { current: OutreachOutboxStatus; applied: boolean } | undefined;
  if (!row) return { applied: false, current: null };
  return row.applied ? { applied: true } : { applied: false, current: row.current };
}

export function ackOutboxRow(id: string, opdirectCommentId: string | null): Promise<OutboxTransitionResult> {
  return applyOutboxTransition(
    id,
    ['pending'],
    `status = 'posted', posted_at = now(), opdirect_comment_id = $1`,
    [opdirectCommentId],
  );
}

export function failOutboxRow(id: string, lastError: string): Promise<OutboxTransitionResult> {
  return applyOutboxTransition(
    id,
    ['pending'],
    `status = 'failed', attempts = attempts + 1, last_error = $1`,
    [lastError],
  );
}

export function retryOutboxRow(id: string): Promise<OutboxTransitionResult> {
  return applyOutboxTransition(id, ['failed', 'skipped'], `status = 'pending'`, []);
}

export function skipOutboxRow(id: string): Promise<OutboxTransitionResult> {
  return applyOutboxTransition(id, ['pending'], `status = 'skipped'`, []);
}

/**
 * Set-based batch ack: one statement regardless of batch size (the route
 * accepts up to 500 items). Returns how many rows actually moved to posted.
 */
export async function ackOutboxRows(
  items: { id: string; opdirect_comment_id?: string | null }[],
): Promise<number> {
  if (items.length === 0) return 0;
  const result = await query(
    `UPDATE direct_outreach_opdirect_outbox t
        SET status = 'posted', posted_at = now(), opdirect_comment_id = v.cid
       FROM unnest($1::uuid[], $2::text[]) AS v(id, cid)
      WHERE t.id = v.id AND t.status = 'pending'`,
    [items.map((i) => i.id), items.map((i) => i.opdirect_comment_id ?? null)],
  );
  return result.rowCount ?? 0;
}
