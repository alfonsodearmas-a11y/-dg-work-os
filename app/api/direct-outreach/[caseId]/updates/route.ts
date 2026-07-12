// Direct Outreach v3 — officer progress updates (append-only, Q5: no PATCH or
// DELETE exists on purpose). One POST carries a remark and/or a working-status
// change and/or a target-date set/clear; log row + current-state upsert commit
// in one transaction (insertOfficerUpdate).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAccess } from '@/lib/auth-helpers';
import { getCase, insertOfficerUpdate, filterMentionableUsers } from '@/lib/direct-outreach/queries';
import { canPostOutreachUpdate } from '@/lib/direct-outreach/permissions';
import { OUTREACH_WORKING_STATUSES, OUTREACH_WORKING_STATUS_LABELS } from '@/lib/direct-outreach/types';
import { cleanMentionBody } from '@/lib/notifications/mention-utils';
import { createNotification } from '@/lib/notifications/notification-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const INT4_MAX = 2147483647;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function agencyScopeFor(session: { user: { role: string; agency?: string | null } }): string | undefined {
  if (session.user.role !== 'agency_manager') return undefined;
  return (session.user.agency || 'NONE').toUpperCase();
}

/** Same opaque-404 param guard as the sibling [caseId] route. */
function parseCaseId(caseId: string): number | NextResponse {
  if (!/^\d+$/.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case ID' }, { status: 400 });
  }
  const n = Number(caseId);
  if (!Number.isSafeInteger(n) || n > INT4_MAX) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  return n;
}

/** Shape AND calendar validity — '2026-02-31' must be a 400, not a ::date 500. */
const isRealDate = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const postSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    working_status: z.enum(OUTREACH_WORKING_STATUSES).optional(),
    // string sets, null clears, absent leaves the target date untouched
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine(
    (d) => d.body !== undefined || d.working_status !== undefined || d.target_date !== undefined,
    { message: 'Empty update' },
  )
  .refine((d) => typeof d.target_date !== 'string' || isRealDate(d.target_date), {
    message: 'Invalid calendar date',
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { caseId } = await params;
  const caseIdNum = parseCaseId(caseId);
  if (caseIdNum instanceof NextResponse) return caseIdNum;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { body, working_status } = parsed.data;
  const targetDate = parsed.data.target_date; // undefined | null | string

  try {
    // Scoped fetch (OR requester-is-assignee): an agency_manager sees cases
    // whose EFFECTIVE agency is theirs plus any case they are ASSIGNED to —
    // the assigned officer must be able to work a cross-agency case. Other
    // out-of-scope users stay an opaque 404, and canPostOutreachUpdate's
    // identity clause below now actually fires for cross-agency assignees.
    const detail = await getCase(caseIdNum, agencyScopeFor(session), session.user.id);
    if (!detail) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    const effectiveAgency = detail.case.effective_agency;
    const assigneeUserId = detail.case.assignee_user_id;

    if (
      !canPostOutreachUpdate(
        session.user.role,
        session.user.id,
        session.user.agency,
        effectiveAgency,
        assigneeUserId,
      )
    ) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const update = await insertOfficerUpdate({
      caseId: caseIdNum,
      authorId: session.user.id,
      authorLabel: session.user.name || session.user.email || 'Unknown user',
      body: body ?? null,
      workingStatus: working_status ?? null,
      targetDate,
    });

    // Fire-and-forget notifications (createNotification drops actor===recipient).
    Promise.resolve(
      (async () => {
        const actorName = session.user.name || 'Someone';
        const referenceUrl = `/direct-outreach?case=${caseIdNum}`;

        // Human-readable event summary for notification bodies.
        const parts: string[] = [];
        if (working_status) parts.push(`Status → ${OUTREACH_WORKING_STATUS_LABELS[working_status]}`);
        if (targetDate === null) parts.push('Target date cleared');
        else if (typeof targetDate === 'string') parts.push(`Target date → ${targetDate}`);

        let mentionedIds: string[] = [];
        let cleanBody: string | undefined;
        if (body) {
          const extracted = await cleanMentionBody(body);
          cleanBody = extracted.cleanBody;
          // Scope guard: never notify a user into a case that 404s for them
          // (the assignee can always open it, so they are always mentionable).
          mentionedIds = await filterMentionableUsers(
            extracted.mentionedUserIds.filter((id) => UUID_RE.test(id)),
            effectiveAgency,
            assigneeUserId,
          );
        }
        const summary = [cleanBody, ...parts].filter(Boolean).join(' · ');

        for (const mentionedId of mentionedIds) {
          createNotification({
            recipientId: mentionedId,
            actorId: session.user.id,
            eventType: 'outreach_update_mention',
            // Keyed by CASE (not the per-post update id) so createNotification's
            // (user, entity, event) rapid-fire dedup collapses repeat mentions
            // within 5 minutes instead of stacking one row per post.
            entityType: 'outreach_case',
            entityId: String(caseIdNum),
            parentEntityType: 'outreach_case',
            parentEntityId: String(caseIdNum),
            parentEntityTitle: `Case #${caseIdNum}`,
            title: `${actorName} mentioned you on outreach case #${caseIdNum}`,
            body: summary || undefined,
            referenceUrl,
            metadata: { updateId: update.id },
          }).catch((err) =>
            logger.warn({ err, caseId: caseIdNum }, '[direct-outreach] update mention notification failed'),
          );
        }

        // The assigned officer hears about someone else's update on their case
        // (mention recipients above already got the higher-signal event).
        if (assigneeUserId && assigneeUserId !== session.user.id && !mentionedIds.includes(assigneeUserId)) {
          createNotification({
            recipientId: assigneeUserId,
            actorId: session.user.id,
            eventType: 'outreach_case_update',
            entityType: 'outreach_case',
            entityId: String(caseIdNum),
            parentEntityType: 'outreach_case',
            parentEntityId: String(caseIdNum),
            parentEntityTitle: `Case #${caseIdNum}`,
            title: `${actorName} updated outreach case #${caseIdNum}`,
            body: summary || undefined,
            referenceUrl,
          }).catch((err) =>
            logger.warn({ err, caseId: caseIdNum }, '[direct-outreach] case update notification failed'),
          );
        }
      })(),
    ).catch((err) =>
      logger.warn({ err, caseId: caseIdNum }, '[direct-outreach] update notification pipeline failed'),
    );

    return NextResponse.json({ update }, { status: 201 });
  } catch (err) {
    logger.error({ err, caseId }, '[direct-outreach] officer update failed');
    return NextResponse.json({ error: 'Failed to post update' }, { status: 500 });
  }
}
