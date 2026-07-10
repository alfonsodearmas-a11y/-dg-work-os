import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAccess } from '@/lib/auth-helpers';
import {
  clearAssignee,
  getCase,
  getUserForAssignment,
  setAssignee,
} from '@/lib/direct-outreach/queries';
import { canAssignOutreachCase, isValidAssignmentTarget } from '@/lib/direct-outreach/permissions';
import { createNotification } from '@/lib/notifications/notification-service';
import { truncate } from '@/lib/format';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const INT4_MAX = 2147483647;

function agencyScopeFor(session: { user: { role: string; agency?: string | null } }): string | undefined {
  if (session.user.role !== 'agency_manager') return undefined;
  return (session.user.agency || 'NONE').toUpperCase();
}

/** Shared param guard. 404 (not 400) for impossible IDs so nonexistent and
 *  out-of-range stay indistinguishable. */
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { caseId } = await params;
  const caseIdNum = parseCaseId(caseId);
  if (caseIdNum instanceof NextResponse) return caseIdNum;

  try {
    // Scope OR requester-is-assignee: an assigned officer opens their case
    // even cross-agency; everyone else out-of-scope stays an opaque 404.
    const detail = await getCase(caseIdNum, agencyScopeFor(session), session.user.id);
    if (!detail) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    logger.error({ err, caseId }, '[direct-outreach] case detail failed');
    return NextResponse.json({ error: 'Failed to load case' }, { status: 500 });
  }
}

// ── PATCH: set/clear the responsible officer ─────────────────────────────────

const patchSchema = z.object({
  assignee_user_id: z.string().uuid().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { caseId } = await params;
  const caseIdNum = parseCaseId(caseId);
  if (caseIdNum instanceof NextResponse) return caseIdNum;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const assigneeUserId = parsed.data.assignee_user_id;

  try {
    // Scoped fetch (OR requester-is-assignee): an agency_manager can only see
    // cases whose EFFECTIVE agency is theirs, plus any case they are assigned
    // to — out-of-scope non-assignees stay an opaque 404. Assignment rights
    // are still gated by canAssignOutreachCase below (a cross-agency assignee
    // can view, not reassign).
    const detail = await getCase(caseIdNum, agencyScopeFor(session), session.user.id);
    if (!detail) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    const effectiveAgency = detail.case.effective_agency;

    if (!canAssignOutreachCase(session.user.role, session.user.agency, effectiveAgency)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (assigneeUserId === null) {
      await clearAssignee(caseIdNum);
      return NextResponse.json({ assignee: null });
    }

    const target = await getUserForAssignment(assigneeUserId);
    if (!target || !target.is_active) {
      return NextResponse.json({ error: 'Assignee not found or inactive' }, { status: 400 });
    }
    if (!isValidAssignmentTarget(target, effectiveAgency, session.user.role)) {
      return NextResponse.json(
        { error: 'Assignee must belong to the case agency or be a superadmin' },
        { status: 403 },
      );
    }

    // Guarded write: no-ops (→409) if a concurrent transfer changed the
    // case's effective agency after the permission check above.
    const applied = await setAssignee(caseIdNum, assigneeUserId, session.user.id, effectiveAgency);
    if (!applied) {
      return NextResponse.json(
        { error: 'Case ownership changed — reload and try again' },
        { status: 409 },
      );
    }

    // Fire-and-forget (createNotification throws on failure; self-assignment
    // is dropped by the service's actor===recipient suppression).
    createNotification({
      recipientId: assigneeUserId,
      actorId: session.user.id,
      eventType: 'outreach_assigned',
      entityType: 'outreach_case',
      entityId: String(caseIdNum),
      title: `Outreach case #${caseIdNum} assigned to you`,
      body: detail.case.description ? truncate(detail.case.description, 140) : undefined,
      referenceUrl: `/direct-outreach?case=${caseIdNum}`,
    }).catch((err) => logger.warn({ err, caseId: caseIdNum }, '[direct-outreach] assignment notification failed'));

    return NextResponse.json({
      assignee: {
        user_id: target.id,
        name: target.name,
        agency: target.agency,
        assigned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err, caseId }, '[direct-outreach] assignment failed');
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}
