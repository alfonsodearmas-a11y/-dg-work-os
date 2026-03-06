import { supabaseAdmin } from '@/lib/db';
import { AIToolDefinition, AIActionProposal } from './types';

// ── Tool Definitions (passed to Claude API) ─────────────────────────────────

export const AI_TOOLS: AIToolDefinition[] = [
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
    description: 'Save a generated document or briefing note to the document vault.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content (markdown)' },
        category: { type: 'string', description: 'Category: briefing, report, memo, analysis, minutes' },
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

// ── Convert to Anthropic tool format ────────────────────────────────────────

export function getAnthropicTools() {
  return AI_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as { type: 'object'; properties?: Record<string, unknown> },
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

// ── Execute Actions ─────────────────────────────────────────────────────────

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

// ── Action Implementations ──────────────────────────────────────────────────

async function executeCreateTask(input: Record<string, unknown>, userId: string) {
  // Resolve assignee name to ID
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

  // Audit log
  await logAIAction(userId, 'create_task', { task_id: data.id, title: data.title, ...input });

  return { success: true, message: `Task "${data.title}" created successfully.` };
}

async function executeUpdateTaskStatus(input: Record<string, unknown>) {
  // Find the task by title match
  const { data: tasks } = await supabaseAdmin
    .from('tasks')
    .select('id, title, status')
    .ilike('title', `%${input.task_title}%`)
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return { success: false, message: `No task found matching "${input.task_title}"` };
  }

  // Use exact match if available, otherwise first partial match
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
      meeting_date: input.meeting_date,
      attendees: input.attendees || [],
      summary: input.notes || null,
      status: 'completed',
      created_by: userId,
    })
    .select('id, title')
    .single();

  if (error) throw error;
  await logAIAction(userId, 'log_meeting', { meeting_id: data.id, title: data.title });

  return { success: true, message: `Meeting "${data.title}" logged successfully.` };
}

async function executeCreateFlag(input: Record<string, unknown>, userId: string) {
  // Create as a high-priority task with flag
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
  // Find recipient
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
      message: input.message,
      type: 'ai_notification',
      read: false,
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
