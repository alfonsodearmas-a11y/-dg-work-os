// Direct Outreach — OP Direct write-back outbox (server-only).
//
// RULE (docs: scripts/opdirect-outbox-bridge.README.md): every Direct Outreach
// mutation — officer assignment/unassignment, working-status change, remark,
// target-date change — enqueues ONE direct_outreach_opdirect_outbox row IN THE
// SAME TRANSACTION as the underlying change (enqueueOutboxRow takes the
// caller's PoolClient for exactly that reason). A local, session-bound bridge
// (scripts/opdirect-outbox-bridge.ts) posts each row to OP Direct as a case
// comment; when op_status_target is set the bridge also sets that status in the
// same save (OP's Update form requires a comment, so status+comment go together).

import { randomUUID, timingSafeEqual } from 'crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
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

const MENTION_RE = /@\[([0-9a-f-]{36})\]/gi;

/**
 * Replace @[uuid] mentions with plain @Name for the OP Direct comment. Unlike
 * cleanMentionBody (notifications, 140-char truncation) this keeps the full
 * remark and runs on the caller's transaction client.
 */
export async function resolveMentionsForOutbox(client: PoolClient, body: string): Promise<string> {
  const ids = [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1]))];
  if (ids.length === 0) return body;
  const result = await client.query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [ids]);
  const names = new Map<string, string>(
    (result.rows as { id: string; name: string | null }[]).map((r) => [r.id, r.name || 'User']),
  );
  return body.replace(MENTION_RE, (_, uid: string) => `@${names.get(uid) || 'User'}`);
}

// ── Bridge token auth (constant-time; export/ack/fail routes) ────────────────

/** Same idiom as app/api/upload/auth: length mismatch burns a dummy compare. */
function constantTimeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * True when the request carries the shared bridge secret. Missing env or header
 * always denies (the caller then falls back to the superadmin session check).
 */
export function isBridgeAuthorized(request: NextRequest): boolean {
  const secret = process.env.BRIDGE_TOKEN?.trim();
  const token = request.headers.get('x-bridge-token');
  if (!secret || !token) return false;
  return constantTimeCompare(token, secret);
}

// ── Status transitions (raw db-pg; guarded by current status) ────────────────

export async function ackOutboxRow(id: string, opdirectCommentId: string | null): Promise<boolean> {
  const result = await query(
    `UPDATE direct_outreach_opdirect_outbox
        SET status = 'posted', posted_at = now(), opdirect_comment_id = $2
      WHERE id = $1 AND status = 'pending'`,
    [id, opdirectCommentId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function failOutboxRow(id: string, lastError: string): Promise<boolean> {
  const result = await query(
    `UPDATE direct_outreach_opdirect_outbox
        SET status = 'failed', attempts = attempts + 1, last_error = $2
      WHERE id = $1 AND status = 'pending'`,
    [id, lastError],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function retryOutboxRow(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE direct_outreach_opdirect_outbox
        SET status = 'pending'
      WHERE id = $1 AND status IN ('failed', 'skipped')`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function skipOutboxRow(id: string): Promise<boolean> {
  const result = await query(
    `UPDATE direct_outreach_opdirect_outbox
        SET status = 'skipped'
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getOutboxStatus(id: string): Promise<OutreachOutboxStatus | null> {
  const result = await query(`SELECT status FROM direct_outreach_opdirect_outbox WHERE id = $1`, [id]);
  return (result.rows[0]?.status as OutreachOutboxStatus | undefined) ?? null;
}
