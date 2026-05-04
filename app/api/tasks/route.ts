import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAssignTasks } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';
import { NotificationDeliveryError } from '@/lib/notifications/errors';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { TASK_COLUMNS, flattenTaskOwner } from '@/lib/task-types';
import { logger } from '@/lib/logger';

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
});

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const agency = searchParams.get('agency');
  const overdue = searchParams.get('overdue');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500', 10)));

  // View As support: DG can pass viewAsRole/viewAsAgency to see data as another role
  const viewAsRole = session.user.role === 'dg' ? searchParams.get('viewAsRole') : null;
  const viewAsAgency = session.user.role === 'dg' ? searchParams.get('viewAsAgency') : null;
  const effectiveRole = viewAsRole || session.user.role;
  const effectiveAgency = viewAsAgency || session.user.agency;

  let query = supabaseAdmin
    .from('tasks')
    .select(`${TASK_COLUMNS}, owner:users!owner_user_id(id, name)`, { count: 'exact' })
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false });

  // Scope by role
  if (effectiveRole === 'officer') {
    query = query.eq('owner_user_id', session.user.id);
  } else if (effectiveRole === 'agency_admin' && effectiveAgency) {
    query = query.ilike('agency', effectiveAgency);
  }

  if (status) query = query.eq('status', status);
  if (agency) query = query.eq('agency', agency);
  if (overdue === 'true') {
    const today = new Date().toISOString().split('T')[0];
    query = query.lt('due_date', today).neq('status', 'done');
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the joined owner name and group by status
  interface TaskRow { status: string; [key: string]: unknown }
  const grouped: Record<string, TaskRow[]> = {
    new: [],
    active: [],
    blocked: [],
    done: [],
  };

  for (const t of data || []) {
    const task = flattenTaskOwner(t) as TaskRow;
    const col = grouped[task.status];
    if (col) col.push(task);
    else grouped.new.push(task);
  }

  return NextResponse.json({
    tasks: grouped,
    lastSync: new Date().toISOString(),
    total: count || 0,
    page,
    limit,
  });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { data, error: validationError } = await parseBody(request, createTaskSchema);
  if (validationError) return validationError;

  const isMinistry = MINISTRY_ROLES.includes(session.user.role);

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

  if (data.assignee_id && canAssignTasks(session.user.role) && data.assignee_id !== session.user.id) {
    try {
      await insertNotification({
        user_id: data.assignee_id,
        type: 'task_assigned',
        title: 'New task assigned to you',
        body: task.title,
        icon: 'task',
        priority: task.priority === 'high' || task.priority === 'critical' ? 'high' : 'medium',
        reference_type: 'task',
        reference_id: task.id,
        reference_url: '/tasks',
        scheduled_for: new Date().toISOString(),
        category: 'tasks',
        source_module: 'tasks',
        action_required: true,
        action_type: 'acknowledge',
      });
    } catch (err) {
      if (err instanceof NotificationDeliveryError) {
        logger.error(err.toLogContext(), '[tasks-create] notification delivery failed');
      } else {
        logger.error({ err }, '[tasks-create] notification delivery failed (unexpected error type)');
      }
      // Task was created — don't fail the create flow because the assignment
      // notification couldn't be delivered.
    }
  }

  return NextResponse.json({ task: flatTask });
});
