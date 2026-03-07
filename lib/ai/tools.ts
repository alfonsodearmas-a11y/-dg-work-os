import { supabaseAdmin } from '@/lib/db';
import { AIToolDefinition, AIActionProposal } from './types';

// ── Tool Categories ──────────────────────────────────────────────────────────
// "query" tools execute immediately (read-only, no confirmation needed)
// "action" tools require user confirmation before execution

type ToolCategory = 'query' | 'action';

interface ToolMeta {
  category: ToolCategory;
  definition: AIToolDefinition;
}

// ── Query Tool Definitions ───────────────────────────────────────────────────

const QUERY_TOOLS: AIToolDefinition[] = [
  {
    name: 'lookup_tasks',
    description: 'Look up tasks from the task database. Use when the user asks about specific tasks, filtered lists, or task details not in the pre-loaded context. Returns up to 50 tasks.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['not_started', 'in_progress', 'blocked', 'completed'], description: 'Filter by status (optional)' },
        agency: { type: 'string', description: 'Filter by agency: GPL, GWI, CJIA, GCAA, MARAD, HECI, General (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority (optional)' },
        search: { type: 'string', description: 'Search term to match against task titles (optional)' },
        assignee_name: { type: 'string', description: 'Filter by assignee name (partial match, optional)' },
        overdue_only: { type: 'boolean', description: 'If true, only return tasks past their due date (optional)' },
        limit: { type: 'number', description: 'Max results (default 30, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'lookup_projects',
    description: 'Look up PSIP infrastructure projects. Use when the user asks about specific projects, filtered project lists, delayed projects by region/agency, or project details.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Complete', 'Delayed', 'In Progress', 'Not Started'], description: 'Filter by computed status (optional)' },
        agency: { type: 'string', description: 'Filter by executing agency (optional)' },
        region: { type: 'string', description: 'Filter by region number e.g. "4" or "Region 4" (optional)' },
        search: { type: 'string', description: 'Search term for project name (optional)' },
        delayed_only: { type: 'boolean', description: 'If true, only return delayed projects sorted by days overdue (optional)' },
        sort: { type: 'string', enum: ['value', 'completion', 'end_date', 'agency', 'name'], description: 'Sort field (optional, default: end_date)' },
        limit: { type: 'number', description: 'Max results (default 30, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'search_documents',
    description: 'Search the Document Vault for uploaded documents (PDFs, reports, briefings). Use when the user asks about document contents, wants to find a specific report, or needs information from uploaded files.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to match against document titles and summaries' },
        agency: { type: 'string', description: 'Filter by agency (optional)' },
        category: { type: 'string', description: 'Filter by category: briefing, report, memo, analysis, minutes (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_meetings',
    description: 'Look up recent meetings and their action items. Use when the user asks about what was discussed, decisions made, or pending action items from meetings.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term for meeting titles (optional)' },
        pending_actions_only: { type: 'boolean', description: 'If true, only return meetings with pending (not done) action items (optional)' },
        limit: { type: 'number', description: 'Max meetings to return (default 15, max 30)' },
      },
      required: [],
    },
  },
  {
    name: 'lookup_service_connections',
    description: 'Look up GPL service connection applications and SLA metrics. Use when the user asks about pending applications, processing times, or SLA compliance for Track A/B connections.',
    input_schema: {
      type: 'object',
      properties: {
        track: { type: 'string', enum: ['A', 'B'], description: 'Filter by track (optional)' },
        status: { type: 'string', enum: ['open', 'completed'], description: 'Filter by status (optional, default: open)' },
        limit: { type: 'number', description: 'Max results (default 30, max 50)' },
      },
      required: [],
    },
  },
];

// ── Action Tool Definitions (require confirmation) ───────────────────────────

const ACTION_TOOLS: AIToolDefinition[] = [
  {
    name: 'create_task',
    description: 'Create a new task in the system. Use when the user asks to create, add, or assign a task.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description (optional)' },
        assignee_name: { type: 'string', description: 'Name of the person to assign to (optional)' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
        agency: { type: 'string', description: 'Agency: GPL, GWI, CJIA, GCAA, MARAD, HECI, or General (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level (optional, defaults to medium)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task_status',
    description: 'Update the status of an existing task. Use when user asks to mark a task as done, in progress, blocked, etc.',
    input_schema: {
      type: 'object',
      properties: {
        task_title: { type: 'string', description: 'Title or partial title of the task to find' },
        status: { type: 'string', enum: ['not_started', 'in_progress', 'blocked', 'completed'], description: 'New status' },
      },
      required: ['task_title', 'status'],
    },
  },
  {
    name: 'save_document',
    description: 'Save a generated document, report, or briefing note to the Document Vault. Use when the user asks you to write and save a report, memo, briefing, analysis, or any document.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content (markdown)' },
        category: { type: 'string', enum: ['briefing', 'report', 'memo', 'analysis', 'minutes', 'letter'], description: 'Document category' },
        agency: { type: 'string', description: 'Associated agency (optional)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'log_meeting',
    description: 'Log a meeting that occurred or create a meeting record.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        meeting_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee names' },
        notes: { type: 'string', description: 'Meeting notes or summary' },
      },
      required: ['title', 'meeting_date'],
    },
  },
  {
    name: 'create_flag',
    description: 'Flag an issue for the DG\'s attention. Creates a high-priority notification or task.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Flag title / issue description' },
        reason: { type: 'string', description: 'Why this needs attention' },
        agency: { type: 'string', description: 'Related agency (optional)' },
        priority: { type: 'string', enum: ['high', 'urgent'], description: 'Priority level' },
      },
      required: ['title', 'reason'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send an in-app notification to a user.',
    input_schema: {
      type: 'object',
      properties: {
        recipient_name: { type: 'string', description: 'Name of the user to notify' },
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification message' },
      },
      required: ['recipient_name', 'title', 'message'],
    },
  },
];

// ── Combined Registry ────────────────────────────────────────────────────────

const ALL_TOOLS: ToolMeta[] = [
  ...QUERY_TOOLS.map(d => ({ category: 'query' as const, definition: d })),
  ...ACTION_TOOLS.map(d => ({ category: 'action' as const, definition: d })),
];

export function isQueryTool(toolName: string): boolean {
  return ALL_TOOLS.some(t => t.definition.name === toolName && t.category === 'query');
}

export function isActionTool(toolName: string): boolean {
  return ALL_TOOLS.some(t => t.definition.name === toolName && t.category === 'action');
}

// ── Convert to Anthropic tool format ────────────────────────────────────────

export function getAnthropicTools() {
  return ALL_TOOLS.map(t => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: t.definition.input_schema as { type: 'object'; properties?: Record<string, unknown> },
  }));
}

// ── Build display proposal from tool_use block ──────────────────────────────

export function buildActionProposal(toolName: string, toolInput: Record<string, unknown>): AIActionProposal {
  const details: Array<{ label: string; value: string }> = [];

  switch (toolName) {
    case 'create_task':
      details.push({ label: 'Title', value: String(toolInput.title || '') });
      if (toolInput.assignee_name) details.push({ label: 'Assign to', value: String(toolInput.assignee_name) });
      if (toolInput.due_date) details.push({ label: 'Due date', value: String(toolInput.due_date) });
      if (toolInput.agency) details.push({ label: 'Agency', value: String(toolInput.agency) });
      if (toolInput.priority) details.push({ label: 'Priority', value: String(toolInput.priority) });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Create Task', description: String(toolInput.description || toolInput.title), details },
      };

    case 'update_task_status':
      details.push({ label: 'Task', value: String(toolInput.task_title || '') });
      details.push({ label: 'New status', value: String(toolInput.status || '').replace(/_/g, ' ') });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Update Task Status', description: `Mark "${toolInput.task_title}" as ${String(toolInput.status).replace(/_/g, ' ')}`, details },
      };

    case 'save_document':
      details.push({ label: 'Title', value: String(toolInput.title || '') });
      if (toolInput.category) details.push({ label: 'Category', value: String(toolInput.category) });
      if (toolInput.agency) details.push({ label: 'Agency', value: String(toolInput.agency) });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Save Document', description: `Save "${toolInput.title}" to Document Vault`, details },
      };

    case 'log_meeting':
      details.push({ label: 'Title', value: String(toolInput.title || '') });
      details.push({ label: 'Date', value: String(toolInput.meeting_date || '') });
      if (toolInput.attendees) details.push({ label: 'Attendees', value: (toolInput.attendees as string[]).join(', ') });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Log Meeting', description: `Record "${toolInput.title}" on ${toolInput.meeting_date}`, details },
      };

    case 'create_flag':
      details.push({ label: 'Issue', value: String(toolInput.title || '') });
      details.push({ label: 'Reason', value: String(toolInput.reason || '') });
      if (toolInput.agency) details.push({ label: 'Agency', value: String(toolInput.agency) });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Flag Issue', description: String(toolInput.reason || toolInput.title), details },
      };

    case 'send_notification':
      details.push({ label: 'To', value: String(toolInput.recipient_name || '') });
      details.push({ label: 'Subject', value: String(toolInput.title || '') });
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: 'Send Notification', description: `Notify ${toolInput.recipient_name}: ${toolInput.title}`, details },
      };

    default:
      return {
        tool_name: toolName,
        tool_input: toolInput,
        display: { title: toolName, description: JSON.stringify(toolInput), details },
      };
  }
}

// ── Execute Actions (write operations, called after user confirmation) ──────

export async function executeAction(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    switch (toolName) {
      case 'create_task':
        return await executeCreateTask(toolInput, userId);
      case 'update_task_status':
        return await executeUpdateTaskStatus(toolInput);
      case 'save_document':
        return await executeSaveDocument(toolInput, userId);
      case 'log_meeting':
        return await executeLogMeeting(toolInput, userId);
      case 'create_flag':
        return await executeCreateFlag(toolInput, userId);
      case 'send_notification':
        return await executeSendNotification(toolInput);
      default:
        return { success: false, message: `Unknown action: ${toolName}` };
    }
  } catch (err: any) {
    console.error(`[ai/tools] Action execution error (${toolName}):`, err);
    return { success: false, message: err.message || 'Action failed' };
  }
}

// ── Execute Query Tools (read-only, auto-executed without confirmation) ─────

export async function executeQueryTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case 'lookup_tasks':
        return await queryTasks(toolInput);
      case 'lookup_projects':
        return await queryProjects(toolInput);
      case 'search_documents':
        return await queryDocuments(toolInput);
      case 'lookup_meetings':
        return await queryMeetings(toolInput);
      case 'lookup_service_connections':
        return await queryServiceConnections(toolInput);
      default:
        return JSON.stringify({ error: `Unknown query tool: ${toolName}` });
    }
  } catch (err: any) {
    console.error(`[ai/tools] Query tool error (${toolName}):`, err);
    return JSON.stringify({ error: err.message || 'Query failed' });
  }
}

// ── Query Tool Implementations ──────────────────────────────────────────────

async function queryTasks(input: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(input.limit) || 30, 50);

  let query = supabaseAdmin
    .from('tasks')
    .select('id, title, status, priority, due_date, agency, assigned_to, description, created_at');

  if (input.status) query = query.eq('status', input.status);
  if (input.agency) query = query.eq('agency', input.agency);
  if (input.priority) query = query.eq('priority', input.priority);
  if (input.search) query = query.ilike('title', `%${input.search}%`);

  if (input.overdue_only) {
    query = query.lt('due_date', new Date().toISOString().slice(0, 10)).neq('status', 'completed');
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false }).limit(limit);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  let tasks = data || [];

  // Resolve assignee names
  if (tasks.some(t => t.assigned_to)) {
    const userIds = [...new Set(tasks.filter(t => t.assigned_to).map(t => t.assigned_to))];
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', userIds);
    const nameMap = new Map((users || []).map(u => [u.id, u.name]));
    tasks = tasks.map(t => ({
      ...t,
      assigned_to_name: t.assigned_to ? nameMap.get(t.assigned_to) || null : null,
    }));
  }

  // Filter by assignee name if provided
  if (input.assignee_name) {
    const searchName = String(input.assignee_name).toLowerCase();
    tasks = tasks.filter(t =>
      (t as any).assigned_to_name?.toLowerCase().includes(searchName)
    );
  }

  return JSON.stringify({ tasks, count: tasks.length });
}

async function queryProjects(input: Record<string, unknown>): Promise<string> {
  const { getProjectsList, getDelayedProjects } = await import('@/lib/project-queries');

  if (input.delayed_only) {
    const delayed = await getDelayedProjects();
    const limit = Math.min(Number(input.limit) || 30, 50);
    let filtered = delayed;
    if (input.agency) {
      filtered = filtered.filter((p: any) =>
        (p.sub_agency || p.executing_agency || '').toLowerCase().includes(String(input.agency).toLowerCase())
      );
    }
    if (input.region) {
      const regionStr = String(input.region).replace(/^Region\s*/i, '');
      filtered = filtered.filter((p: any) =>
        String(p.region || '').includes(regionStr)
      );
    }
    return JSON.stringify({ projects: filtered.slice(0, limit), count: filtered.length });
  }

  const result = await getProjectsList({
    agency: input.agency ? String(input.agency) : undefined,
    status: input.status ? String(input.status) : undefined,
    region: input.region ? String(input.region) : undefined,
    search: input.search ? String(input.search) : undefined,
    sort: (input.sort as any) || 'end_date',
    limit: Math.min(Number(input.limit) || 30, 50),
  });

  return JSON.stringify({ projects: result.projects, count: result.total });
}

async function queryDocuments(input: Record<string, unknown>): Promise<string> {
  const { searchDocuments } = await import('@/lib/document-search');
  const results = await searchDocuments(String(input.query), {
    agency: input.agency ? String(input.agency) : undefined,
    document_type: input.category ? String(input.category) : undefined,
  });
  return JSON.stringify({
    documents: (results || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      agency: d.agency,
      summary: d.summary?.slice(0, 300),
      uploaded_at: d.uploaded_at || d.created_at,
    })),
    count: (results || []).length,
  });
}

async function queryMeetings(input: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(input.limit) || 15, 30);

  let query = supabaseAdmin
    .from('meetings')
    .select('id, title, date, status, attendees, summary, decisions, meeting_actions(id, task, owner, due_date, done)')
    .order('date', { ascending: false })
    .limit(limit);

  if (input.search) query = query.ilike('title', `%${input.search}%`);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  let meetings = data || [];

  if (input.pending_actions_only) {
    meetings = meetings.filter((m: any) =>
      m.meeting_actions?.some((a: any) => !a.done)
    );
  }

  return JSON.stringify({
    meetings: meetings.map((m: any) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      status: m.status,
      attendees: m.attendees,
      summary: m.summary?.slice(0, 500),
      decisions: m.decisions,
      action_items: (m.meeting_actions || []).map((a: any) => ({
        task: a.task,
        owner: a.owner,
        due_date: a.due_date,
        done: a.done,
      })),
    })),
    count: meetings.length,
  });
}

async function queryServiceConnections(input: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(input.limit) || 30, 50);
  const status = input.status ? String(input.status) : 'open';

  let query = supabaseAdmin
    .from('service_connections')
    .select('id, customer_reference, first_name, last_name, track, status, current_stage, application_date, first_seen_date, region, district, total_days_to_complete')
    .eq('status', status)
    .not('is_legacy', 'eq', true)
    .order('first_seen_date', { ascending: true })
    .limit(limit);

  if (input.track) query = query.eq('track', input.track);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  const now = Date.now();
  const connections = (data || []).map((c: any) => ({
    ...c,
    customer_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
    days_pending: c.first_seen_date
      ? Math.round((now - new Date(c.first_seen_date).getTime()) / (1000 * 60 * 60 * 24))
      : null,
  }));

  return JSON.stringify({ connections, count: connections.length });
}

// ── Action Implementations (write operations) ───────────────────────────────

async function executeCreateTask(input: Record<string, unknown>, userId: string) {
  let assigneeId: string | null = null;
  if (input.assignee_name) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('name', `%${input.assignee_name}%`)
      .limit(1)
      .maybeSingle();
    assigneeId = user?.id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description || null,
      status: 'not_started',
      priority: input.priority || 'medium',
      due_date: input.due_date || null,
      agency: input.agency || null,
      assigned_to: assigneeId,
      created_by: userId,
    })
    .select('id, title')
    .single();

  if (error) throw error;
  await logAIAction(userId, 'create_task', { task_id: data.id, title: data.title, ...input });
  return { success: true, message: `Task "${data.title}" created successfully.` };
}

async function executeUpdateTaskStatus(input: Record<string, unknown>) {
  const { data: tasks } = await supabaseAdmin
    .from('tasks')
    .select('id, title, status')
    .ilike('title', `%${input.task_title}%`)
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return { success: false, message: `No task found matching "${input.task_title}"` };
  }

  const exact = tasks.find(t => t.title.toLowerCase() === String(input.task_title).toLowerCase());
  const target = exact || tasks[0];

  const { error } = await supabaseAdmin
    .from('tasks')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', target.id);

  if (error) throw error;
  return { success: true, message: `Task "${target.title}" updated to ${String(input.status).replace(/_/g, ' ')}.` };
}

async function executeSaveDocument(input: Record<string, unknown>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert({
      title: input.title,
      content: input.content,
      category: input.category || 'briefing',
      agency: input.agency || null,
      uploaded_by: userId,
      source: 'ai_generated',
    })
    .select('id, title')
    .single();

  if (error) throw error;
  await logAIAction(userId, 'save_document', { document_id: data.id, title: data.title });
  return { success: true, message: `Document "${data.title}" saved to Document Vault.` };
}

async function executeLogMeeting(input: Record<string, unknown>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('meetings')
    .insert({
      title: input.title,
      date: input.meeting_date || new Date().toISOString(),
      attendees: input.attendees || [],
      summary: input.notes || null,
      status: 'ANALYZED',
    })
    .select('id, title')
    .single();

  if (error) throw error;
  await logAIAction(userId, 'log_meeting', { meeting_id: data.id, title: data.title });
  return { success: true, message: `Meeting "${data.title}" logged successfully.` };
}

async function executeCreateFlag(input: Record<string, unknown>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: `[FLAG] ${input.title}`,
      description: String(input.reason || ''),
      status: 'not_started',
      priority: input.priority || 'urgent',
      agency: input.agency || null,
      created_by: userId,
    })
    .select('id, title')
    .single();

  if (error) throw error;
  await logAIAction(userId, 'create_flag', { task_id: data.id, ...input });
  return { success: true, message: `Issue flagged: "${input.title}"` };
}

async function executeSendNotification(input: Record<string, unknown>) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('name', `%${input.recipient_name}%`)
    .limit(1)
    .maybeSingle();

  if (!user) {
    return { success: false, message: `User "${input.recipient_name}" not found.` };
  }

  const { error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: user.id,
      title: input.title,
      body: String(input.message || ''),
      type: 'ai_notification',
      category: 'system',
      priority: 'medium',
      scheduled_for: new Date().toISOString(),
      source_module: 'ai-assistant',
      action_required: false,
      icon: 'bot',
      metadata: {},
    });

  if (error) throw error;
  return { success: true, message: `Notification sent to ${input.recipient_name}.` };
}

// ── Audit Logging ───────────────────────────────────────────────────────────

async function logAIAction(userId: string, actionType: string, metadata: Record<string, unknown>) {
  try {
    await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: userId,
      action_type: 'ai_action',
      details: { ai_tool: actionType, ...metadata },
    });
  } catch (err) {
    console.error('[ai/tools] Audit log error:', err);
  }
}
