import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAssignTasks } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { createNotification } from '@/lib/notifications/notification-service';
import { NotificationDeliveryError } from '@/lib/notifications/errors';
import { notifyTaskWatchers } from '@/lib/notifications/notify-task-watchers';
import { sendEmail } from '@/lib/email';
import { renderInstantEmail } from '@/lib/notifications/email-templates';
import { getAppBaseUrl } from '@/lib/notifications/email-utils';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { TASK_COLUMNS, flattenTaskOwner, type TaskStatus } from '@/lib/task-types';
import { logger } from '@/lib/logger';

const ALL_STATUSES: TaskStatus[] = ['new', 'active', 'blocked', 'awaiting_verification', 'done', 'superseded'];
const TERMINAL_STATUSES: TaskStatus[] = ['done', 'superseded'];
const GRACE_PERIOD_DAYS = parseInt(process.env.TASKS_GRACE_PERIOD_DAYS || '7', 10);

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['new', 'active', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().optional(),
  agency: z.string().optional(),
  role: z.string().optional(),
  assignee_id: z.string().optional(),
  source_meeting_id: z.string().optional(),
  // Extraction provenance — populated when an item lands here from
  // /api/action-items/review/[extractionId] or any other extraction path.
  source: z.enum(['manual', 'extraction']).optional(),
  extraction_id: z.string().uuid().nullable().optional(),
  extraction_item_idx: z.number().int().nullable().optional(),
  source_timestamp: z.string().nullable().optional(),
  source_quote: z.string().nullable().optional(),
  owner_name_raw: z.string().nullable().optional(),
  verb_category: z.enum(['correspondence','decision','information','scheduling','project_update','analysis']).nullable().optional(),
  due_trigger: z.string().nullable().optional(),
  confidence_overall: z.number().min(0).max(1).nullable().optional(),
  confidence_reasons: z.array(z.string()).nullable().optional(),
  visibility_scope: z.enum(['agency_normal','dg_only']).optional(),
  // "Also notify" — additional users to add as watchers. Watchers receive
  // the same email events as the primary assignee (modulo their own prefs).
  watchers: z.array(z.string().uuid()).optional(),
});

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  // Comma-separated list to match the URL convention used by the Kanban URL
  // sync (hooks/useBoardUrlSync.ts) and the bento "View all" deep-links from
  // /intel/[agency]. Values are canonical uppercase per migration 106.
  const agencyParam = searchParams.get('agency');
  const agencyList = agencyParam ? agencyParam.split(',').filter(Boolean) : [];
  const overdue = searchParams.get('overdue');
  const showCompleted = searchParams.get('show_completed') === 'true';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500', 10)));

  // View As support: DG can pass viewAsRole/viewAsAgency to see data as another role
  const viewAsRole = session.user.role === 'superadmin' ? searchParams.get('viewAsRole') : null;
  const viewAsAgency = session.user.role === 'superadmin' ? searchParams.get('viewAsAgency') : null;
  const effectiveRole = viewAsRole || session.user.role;
  const effectiveAgency = viewAsAgency || session.user.agency;

  // Grace-period filter (D1): hide done/superseded older than TASKS_GRACE_PERIOD_DAYS
  // unless the caller explicitly opts in (?show_completed=true) or pins a single
  // status with ?status=done|superseded.
  const applyGraceFilter = !showCompleted && !status;
  const graceCutoff = applyGraceFilter
    ? new Date(Date.now() - GRACE_PERIOD_DAYS * 86400000).toISOString()
    : null;

  let query = supabaseAdmin
    .from('tasks')
    .select(`${TASK_COLUMNS}, owner:users!owner_user_id(id, name)`, { count: 'exact' })
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false });

  // Scope by role (two-level: agency managers see their agency, superadmins all)
  if (effectiveRole === 'agency_manager' && effectiveAgency) {
    query = query.ilike('agency', effectiveAgency);
  }

  if (status) query = query.eq('status', status);
  if (agencyList.length === 1) {
    query = query.eq('agency', agencyList[0]);
  } else if (agencyList.length > 1) {
    query = query.in('agency', agencyList);
  }
  if (overdue === 'true') {
    const today = new Date().toISOString().split('T')[0];
    query = query.lt('due_date', today).neq('status', 'done');
  }
  if (graceCutoff) {
    // Keep all non-terminal rows AND terminals whose completed_at is within the
    // grace window. Backfill in migration 107 ensures terminals have a value.
    query = query.or(
      `status.not.in.(done,superseded),completed_at.gte.${graceCutoff}`
    );
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // D8 — explicit 6-bucket grouping. No catch-all: unknown statuses log a
  // warning and are dropped (defensive against schema drift).
  interface TaskRow { id: string; status: string; [key: string]: unknown }
  const grouped: Record<TaskStatus, TaskRow[]> = {
    new: [],
    active: [],
    blocked: [],
    awaiting_verification: [],
    done: [],
    superseded: [],
  };

  for (const t of data || []) {
    const task = flattenTaskOwner(t) as TaskRow;
    const col = grouped[task.status as TaskStatus];
    if (col) {
      col.push(task);
    } else {
      logger.warn(
        { taskId: task.id, status: task.status },
        '[/api/tasks] unknown task.status — dropping. Possible schema drift.'
      );
    }
  }

  // Count of grace-pruned terminals (D1 pill driver). Skipped when no grace
  // filter applied, since the answer is implicitly 0 for the visible view.
  let olderCompletedCount = 0;
  if (applyGraceFilter && graceCutoff) {
    let countQuery = supabaseAdmin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', TERMINAL_STATUSES)
      .lt('completed_at', graceCutoff);
    if (effectiveRole === 'agency_manager' && effectiveAgency) {
      countQuery = countQuery.ilike('agency', effectiveAgency);
    }
    if (agencyList.length === 1) {
      countQuery = countQuery.eq('agency', agencyList[0]);
    } else if (agencyList.length > 1) {
      countQuery = countQuery.in('agency', agencyList);
    }
    const { count: olderCount } = await countQuery;
    olderCompletedCount = olderCount || 0;
  }

  return NextResponse.json({
    tasks: grouped,
    lastSync: new Date().toISOString(),
    total: count || 0,
    page,
    limit,
    show_completed: showCompleted,
    grace_period_days: GRACE_PERIOD_DAYS,
    older_completed_count: olderCompletedCount,
  });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { data, error: validationError } = await parseBody(request, createTaskSchema);
  if (validationError) return validationError;

  const isMinistry = (session.user.role) === 'superadmin';

  // Officers cannot assign to others
  let ownerId = session.user.id;
  if (data.assignee_id && canAssignTasks(session.user.role)) {
    // Non-ministry users can only assign to users within their own agency
    if (!isMinistry && session.user.agency) {
      const { data: assigneeUser } = await supabaseAdmin
        .from('users')
        .select('agency')
        .eq('id', data.assignee_id)
        .single();
      if (assigneeUser && assigneeUser.agency?.toLowerCase() !== session.user.agency?.toLowerCase()) {
        return apiError('FORBIDDEN', 'Cannot assign tasks to users outside your agency', 403);
      }
    }
    ownerId = data.assignee_id;
  }

  // Non-ministry users: force agency to their own
  const taskAgency = isMinistry ? (data.agency || null) : (session.user.agency?.toUpperCase() || data.agency || null);

  const { validateTaskDraft } = await import('@/lib/action-items/validation');
  const v = validateTaskDraft({
    source: 'manual',
    title: data.title,
    // Pass resolved agency and owner — if agency is null (ministry cross-agency task),
    // the validator will flag it but we only surface title-level issues here since
    // auth + form already enforce owner and agency for agency-scoped users.
    agency: taskAgency,
    owner_user_id: ownerId,
    owner_name_raw: null,
    verb_category: null,
  });
  if (!v.ok) {
    const titleIssues = v.issues.filter(i => i.field === 'title');
    if (titleIssues.length > 0) {
      return NextResponse.json({ error: 'Validation failed', issues: titleIssues }, { status: 400 });
    }
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description || null,
      status: data.status || 'new',
      priority: data.priority || 'medium',
      due_date: data.due_date || null,
      agency: taskAgency,
      role: data.role || null,
      owner_user_id: ownerId,
      assigned_by_user_id: data.assignee_id && canAssignTasks(session.user.role) ? session.user.id : null,
      source_meeting_id: data.source_meeting_id || null,
      source: data.source ?? 'manual',
      extraction_id: data.extraction_id ?? null,
      extraction_item_idx: data.extraction_item_idx ?? null,
      source_timestamp: data.source_timestamp ?? null,
      source_quote: data.source_quote ?? null,
      owner_name_raw: data.owner_name_raw ?? null,
      verb_category: data.verb_category ?? null,
      due_trigger: data.due_trigger ?? null,
      confidence_overall: data.confidence_overall ?? null,
      confidence_reasons: data.confidence_reasons ?? null,
      visibility_scope: data.visibility_scope ?? 'agency_normal',
    })
    .select(`${TASK_COLUMNS}, owner:users!owner_user_id(id, name)`)
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  const flatTask = flattenTaskOwner(task);

  await supabaseAdmin.from('task_activity').insert({
    task_id: task.id,
    user_id: session.user.id,
    action: 'created',
    old_value: null,
    new_value: null,
  });

  // --- Watchers ("Also notify") ----------------------------------------
  // Insert watcher rows up-front so the agency-head and watcher fan-out can
  // see them. Dedupe against the assignee at *send* time (not insert), so a
  // user listed both as assignee and watcher still has the watcher row but
  // only receives one email per event — see lib/notifications/notify-task-watchers.
  const watcherIds = (data.watchers ?? []).filter((id) => id && id !== session.user.id);
  if (watcherIds.length > 0) {
    const rows = watcherIds.map((uid) => ({
      task_id: task.id,
      user_id: uid,
      added_by_user_id: session.user.id,
    }));
    const { error: watcherErr } = await supabaseAdmin
      .from('task_watchers')
      .upsert(rows, { onConflict: 'task_id,user_id', ignoreDuplicates: true });
    if (watcherErr) {
      logger.error({ err: watcherErr, taskId: task.id }, '[tasks-create] watcher insert failed');
    }
  }

  // --- Notifications ---------------------------------------------------
  // Fire-and-forget: never let a notification failure abort task creation.
  Promise.resolve((async () => {
    const isOverdue = task.due_date ? new Date(task.due_date) < new Date() : false;

    // 1. Primary assignee notification (only when explicitly assigned to someone else).
    if (data.assignee_id && canAssignTasks(session.user.role) && data.assignee_id !== session.user.id) {
      try {
        await createNotification({
          recipientId: data.assignee_id,
          actorId: session.user.id,
          eventType: 'task_assigned',
          entityType: 'task',
          entityId: task.id,
          title: `New task assigned to you: ${task.title}`,
          body: (task.description as string | null)?.slice(0, 160) || '',
          referenceUrl: `/tasks?taskId=${task.id}`,
          metadata: { taskId: task.id, agency: taskAgency },
          tierContext: {
            taskPriority: task.priority,
            taskStatus: task.status,
            isOverdue,
          },
        });
      } catch (err) {
        if (err instanceof NotificationDeliveryError) {
          logger.error(err.toLogContext(), '[tasks-create] notification delivery failed');
        } else {
          logger.error({ err }, '[tasks-create] notification delivery failed (unexpected error type)');
        }
      }
    }

    // 2. Watcher fan-out (skips current assignee at send time). Reuse the IDs
    //    we just upserted instead of re-querying, avoiding a race with any
    //    concurrent self-removal.
    try {
      await notifyTaskWatchers(
        task.id,
        {
          taskTitle: task.title,
          body: (task.description as string | null)?.slice(0, 160) || '',
          actorId: session.user.id,
          currentAssigneeUserId: ownerId,
          referenceUrl: `/tasks?taskId=${task.id}`,
          parentEntityType: taskAgency ? 'agency' : undefined,
          parentEntityId: taskAgency ?? undefined,
        },
        { watcherUserIds: watcherIds },
      );
    } catch (err) {
      logger.error({ err, taskId: task.id }, '[tasks-create] watcher fan-out failed');
    }

    // 3. Agency-head fan-out + audit log.
    //    Always log: every code path lands a row in agency_head_notification_log
    //    so the audit trail explains why no email went out for an agency.
    if (taskAgency) {
      await sendAgencyHeadNoticeForTask({
        taskId: task.id,
        taskTitle: task.title,
        taskBody: (task.description as string | null)?.slice(0, 160) || '',
        agency: taskAgency,
        priority: (task.priority as string | null) ?? null,
        assigneeId: ownerId,
        actorId: session.user.id,
      });
    }
  })()).catch((err: unknown) => logger.error({ err }, '[tasks-create] notification block uncaught'));

  return NextResponse.json({ task: flatTask });
});

// ---------------------------------------------------------------------------
// Agency-head email fan-out
//
// Recipient lives in agency_psip_focal_point.agency_head_email and may not
// have a Work OS user account, so the existing `notifications` table (keyed
// on user_id) cannot log them. Every send attempt — including the no-op
// cases — produces a row in agency_head_notification_log.
// ---------------------------------------------------------------------------
async function sendAgencyHeadNoticeForTask(params: {
  taskId: string;
  taskTitle: string;
  taskBody: string;
  agency: string;
  priority: string | null;
  assigneeId: string;
  actorId: string;
}): Promise<void> {
  const { taskId, taskTitle, taskBody, agency, priority, assigneeId, actorId } = params;

  // Look up agency head + assignee email in parallel (need assignee email
  // for the dup-of-assignee skip case).
  const [headRes, assigneeRes] = await Promise.all([
    supabaseAdmin
      .from('agency_psip_focal_point')
      .select('agency_head_name, agency_head_email')
      .eq('agency', agency.toUpperCase())
      .maybeSingle(),
    supabaseAdmin.from('users').select('email').eq('id', assigneeId).maybeSingle(),
  ]);

  const headEmail = headRes.data?.agency_head_email?.trim() || null;
  const headName = headRes.data?.agency_head_name?.trim() || null;
  const assigneeEmail = assigneeRes.data?.email?.toLowerCase() || null;

  // Case A: blank — nothing to send. Log the skip so the audit trail explains.
  if (!headEmail) {
    await supabaseAdmin.from('agency_head_notification_log').insert({
      agency: agency.toUpperCase(),
      recipient_email: '',
      recipient_name: headName,
      task_id: taskId,
      status: 'skipped_blank',
    });
    return;
  }

  // Case B: head email matches the assignee — would be a duplicate send.
  if (assigneeEmail && headEmail.toLowerCase() === assigneeEmail) {
    await supabaseAdmin.from('agency_head_notification_log').insert({
      agency: agency.toUpperCase(),
      recipient_email: headEmail,
      recipient_name: headName,
      task_id: taskId,
      status: 'skipped_dup_assignee',
    });
    return;
  }

  // Case C: send. Render with the existing email-templates path so the
  // styling matches the assignee email exactly.
  const baseUrl = getAppBaseUrl();
  const rendered = renderInstantEmail({
    title: taskTitle,
    body: taskBody,
    event_type: 'task_agency_head_notice',
    importance_tier: priority === 'high' || priority === 'critical' ? 'critical' : 'important',
    actor_name: undefined,
    entity_type: 'task',
    entity_url: `${baseUrl}/tasks?taskId=${taskId}`,
    created_at: new Date().toISOString(),
  });

  const subject = `[DG Work OS] New task assigned to ${agency.toUpperCase()}: ${taskTitle}`;

  const result = await sendEmail({
    to: headEmail,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  await supabaseAdmin.from('agency_head_notification_log').insert({
    agency: agency.toUpperCase(),
    recipient_email: headEmail,
    recipient_name: headName,
    task_id: taskId,
    status: result.success ? 'sent' : 'failed',
    error: result.success ? null : result.error ?? 'unknown error',
  });

  // Surface a structured log line whether or not the actor cares; matches
  // the v2 notification-service positive-signal pattern.
  logger.info(
    {
      agency: agency.toUpperCase(),
      task_id: taskId,
      recipient_email: headEmail,
      sent: result.success,
      actor_id: actorId,
    },
    '[tasks-create] agency-head notice',
  );
}
