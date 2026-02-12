import { query, transaction } from './db-pg';
import type { PoolClient } from 'pg';
import { validateTransition, getValidTransitions, type TaskStatus } from './task-transitions';

export { validateTransition, getValidTransitions };
export type { TaskStatus };

// ── Types ──────────────────────────────────────────────────────────────────
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskAction =
  | 'created' | 'status_changed' | 'priority_changed' | 'reassigned'
  | 'commented' | 'due_date_changed' | 'extension_requested'
  | 'extension_approved' | 'extension_rejected' | 'evidence_added'
  | 'notion_synced';

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  agency: string;
  assignee_id: string;
  created_by: string;
  due_date: string | null;
  tags: string[];
  evidence: string[];
  completion_notes: string | null;
  notion_page_id: string | null;
  last_notion_sync_at: string | null;
  source_meeting_id: string | null;
  source_recording_id: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assignee_name?: string;
  assignee_email?: string;
  creator_name?: string;
}

export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  agency?: string;
  assignee_id?: string;
  created_by?: string;
  search?: string;
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  agency: string;
  assignee_id: string;
  due_date?: string;
  tags?: string[];
  source_meeting_id?: string;
  source_recording_id?: string;
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createTask(data: CreateTaskInput, createdById: string): Promise<TaskRow> {
  return transaction(async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO tasks (title, description, priority, agency, assignee_id, created_by, due_date, tags, source_meeting_id, source_recording_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.title,
        data.description || null,
        data.priority || 'medium',
        data.agency,
        data.assignee_id,
        createdById,
        data.due_date || null,
        data.tags || [],
        data.source_meeting_id || null,
        data.source_recording_id || null,
      ]
    );

    const task = result.rows[0];

    // Activity log
    await client.query(
      `INSERT INTO task_activities (task_id, user_id, action, to_value)
       VALUES ($1, $2, 'created', $3)`,
      [task.id, createdById, 'assigned']
    );

    return task;
  });
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const result = await query(
    `SELECT t.*,
       a.full_name AS assignee_name, a.email AS assignee_email,
       c.full_name AS creator_name
     FROM tasks t
     JOIN users a ON a.id = t.assignee_id
     JOIN users c ON c.id = t.created_by
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getTasksList(filters: TaskFilters, userId?: string, userRole?: string): Promise<{ tasks: TaskRow[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  // Role-based scoping
  if (userRole === 'ceo' && userId) {
    conditions.push(`t.assignee_id = $${paramIdx++}`);
    params.push(userId);
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(`t.status = ANY($${paramIdx++})`);
      params.push(filters.status);
    } else {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(filters.status);
    }
  }

  if (filters.priority) {
    conditions.push(`t.priority = $${paramIdx++}`);
    params.push(filters.priority);
  }

  if (filters.agency) {
    conditions.push(`t.agency = $${paramIdx++}`);
    params.push(filters.agency);
  }

  if (filters.assignee_id) {
    conditions.push(`t.assignee_id = $${paramIdx++}`);
    params.push(filters.assignee_id);
  }

  if (filters.search) {
    conditions.push(`t.title ILIKE $${paramIdx++}`);
    params.push(`%${filters.search}%`);
  }

  if (filters.due_before) {
    conditions.push(`t.due_date <= $${paramIdx++}`);
    params.push(filters.due_before);
  }

  if (filters.due_after) {
    conditions.push(`t.due_date >= $${paramIdx++}`);
    params.push(filters.due_after);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortBy = filters.sort_by || 'created_at';
  const sortDir = filters.sort_dir || 'desc';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Whitelist sort columns
  const validSorts = ['created_at', 'updated_at', 'due_date', 'priority', 'status', 'title'];
  const safeSort = validSorts.includes(sortBy) ? sortBy : 'created_at';

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT t.*,
         a.full_name AS assignee_name, a.email AS assignee_email,
         c.full_name AS creator_name
       FROM tasks t
       JOIN users a ON a.id = t.assignee_id
       JOIN users c ON c.id = t.created_by
       ${where}
       ORDER BY t.${safeSort} ${sortDir === 'asc' ? 'ASC' : 'DESC'}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM tasks t ${where}`, params),
  ]);

  return {
    tasks: dataRes.rows,
    total: parseInt(countRes.rows[0].count),
  };
}

export async function updateTaskStatus(
  id: string,
  newStatus: TaskStatus,
  userId: string,
  extra?: { rejection_reason?: string; completion_notes?: string; evidence?: string[] }
): Promise<TaskRow> {
  return transaction(async (client: PoolClient) => {
    const current = await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [id]);
    if (current.rows.length === 0) throw new Error('Task not found');

    const task = current.rows[0];
    const oldStatus = task.status;

    // Build update fields
    const sets: string[] = [`status = $1`];
    const params: any[] = [newStatus];
    let idx = 2;

    // Lifecycle timestamps
    if (newStatus === 'acknowledged' && !task.acknowledged_at) {
      sets.push(`acknowledged_at = NOW()`);
    }
    if (newStatus === 'in_progress' && !task.started_at) {
      sets.push(`started_at = NOW()`);
    }
    if (newStatus === 'submitted') {
      sets.push(`submitted_at = NOW()`);
      if (extra?.completion_notes) {
        sets.push(`completion_notes = $${idx++}`);
        params.push(extra.completion_notes);
      }
      if (extra?.evidence) {
        sets.push(`evidence = $${idx++}`);
        params.push(extra.evidence);
      }
    }
    if (newStatus === 'verified') {
      sets.push(`verified_at = NOW()`);
    }
    if (newStatus === 'rejected') {
      sets.push(`rejected_at = NOW()`);
      if (extra?.rejection_reason) {
        sets.push(`rejection_reason = $${idx++}`);
        params.push(extra.rejection_reason);
      }
    }

    params.push(id);
    const result = await client.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Activity log
    await client.query(
      `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value, comment)
       VALUES ($1, $2, 'status_changed', $3, $4, $5)`,
      [id, userId, oldStatus, newStatus, extra?.rejection_reason || null]
    );

    return result.rows[0];
  });
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<TaskRow, 'title' | 'description' | 'priority' | 'due_date' | 'tags' | 'assignee_id'>>,
  userId: string
): Promise<TaskRow> {
  return transaction(async (client: PoolClient) => {
    const current = await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [id]);
    if (current.rows.length === 0) throw new Error('Task not found');
    const task = current.rows[0];

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.title !== undefined) {
      sets.push(`title = $${idx++}`);
      params.push(updates.title);
    }
    if (updates.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(updates.description);
    }
    if (updates.priority !== undefined && updates.priority !== task.priority) {
      sets.push(`priority = $${idx++}`);
      params.push(updates.priority);
      await client.query(
        `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value)
         VALUES ($1, $2, 'priority_changed', $3, $4)`,
        [id, userId, task.priority, updates.priority]
      );
    }
    if (updates.due_date !== undefined && updates.due_date !== task.due_date) {
      sets.push(`due_date = $${idx++}`);
      params.push(updates.due_date);
      await client.query(
        `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value)
         VALUES ($1, $2, 'due_date_changed', $3, $4)`,
        [id, userId, task.due_date, updates.due_date]
      );
    }
    if (updates.tags !== undefined) {
      sets.push(`tags = $${idx++}`);
      params.push(updates.tags);
    }
    if (updates.assignee_id !== undefined && updates.assignee_id !== task.assignee_id) {
      sets.push(`assignee_id = $${idx++}`);
      params.push(updates.assignee_id);
      sets.push(`status = 'assigned'`);
      sets.push(`acknowledged_at = NULL`);
      sets.push(`started_at = NULL`);
      sets.push(`submitted_at = NULL`);
      await client.query(
        `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value)
         VALUES ($1, $2, 'reassigned', $3, $4)`,
        [id, userId, task.assignee_id, updates.assignee_id]
      );
    }

    if (sets.length === 0) {
      return task;
    }

    params.push(id);
    const result = await client.query(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  });
}

// ── Activities ─────────────────────────────────────────────────────────────

export async function getTaskActivities(taskId: string) {
  const result = await query(
    `SELECT a.*, u.full_name AS user_name
     FROM task_activities a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = $1
     ORDER BY a.created_at ASC`,
    [taskId]
  );
  return result.rows;
}

// ── Comments ───────────────────────────────────────────────────────────────

export async function createComment(taskId: string, userId: string, body: string, parentId?: string) {
  return transaction(async (client: PoolClient) => {
    const result = await client.query(
      `INSERT INTO task_comments (task_id, user_id, body, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [taskId, userId, body, parentId || null]
    );

    await client.query(
      `INSERT INTO task_activities (task_id, user_id, action, comment)
       VALUES ($1, $2, 'commented', $3)`,
      [taskId, userId, body.substring(0, 200)]
    );

    return result.rows[0];
  });
}

export async function getComments(taskId: string) {
  const result = await query(
    `SELECT c.*, u.full_name AS user_name, u.role AS user_role
     FROM task_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`,
    [taskId]
  );
  return result.rows;
}

// ── Extension Requests ─────────────────────────────────────────────────────

export async function createExtensionRequest(taskId: string, userId: string, requestedDate: string, reason: string) {
  return transaction(async (client: PoolClient) => {
    const task = await client.query('SELECT due_date FROM tasks WHERE id = $1', [taskId]);
    if (task.rows.length === 0) throw new Error('Task not found');

    const result = await client.query(
      `INSERT INTO deadline_extension_requests (task_id, requested_by, original_due_date, requested_due_date, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [taskId, userId, task.rows[0].due_date, requestedDate, reason]
    );

    await client.query(
      `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value, comment)
       VALUES ($1, $2, 'extension_requested', $3, $4, $5)`,
      [taskId, userId, task.rows[0].due_date, requestedDate, reason]
    );

    return result.rows[0];
  });
}

export async function decideExtension(extId: string, decidedBy: string, approved: boolean, note?: string) {
  return transaction(async (client: PoolClient) => {
    const ext = await client.query('SELECT * FROM deadline_extension_requests WHERE id = $1', [extId]);
    if (ext.rows.length === 0) throw new Error('Extension request not found');
    const req = ext.rows[0];

    const status = approved ? 'approved' : 'rejected';
    await client.query(
      `UPDATE deadline_extension_requests SET status = $1, decided_by = $2, decision_note = $3, decided_at = NOW()
       WHERE id = $4`,
      [status, decidedBy, note || null, extId]
    );

    if (approved) {
      await client.query(
        `UPDATE tasks SET due_date = $1 WHERE id = $2`,
        [req.requested_due_date, req.task_id]
      );
    }

    await client.query(
      `INSERT INTO task_activities (task_id, user_id, action, from_value, to_value, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.task_id,
        decidedBy,
        approved ? 'extension_approved' : 'extension_rejected',
        req.original_due_date,
        approved ? req.requested_due_date : req.original_due_date,
        note || null,
      ]
    );

    return { ...req, status, decided_by: decidedBy, decision_note: note };
  });
}

export async function getExtensionRequests(taskId: string) {
  const result = await query(
    `SELECT e.*, u.full_name AS requester_name, d.full_name AS decider_name
     FROM deadline_extension_requests e
     JOIN users u ON u.id = e.requested_by
     LEFT JOIN users d ON d.id = e.decided_by
     WHERE e.task_id = $1
     ORDER BY e.created_at DESC`,
    [taskId]
  );
  return result.rows;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getTaskStats(filters?: { agency?: string; assignee_id?: string }) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters?.agency) {
    conditions.push(`agency = $${idx++}`);
    params.push(filters.agency);
  }
  if (filters?.assignee_id) {
    conditions.push(`assignee_id = $${idx++}`);
    params.push(filters.assignee_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('verified')) AS total_active,
       COUNT(*) FILTER (WHERE status = 'overdue') AS overdue,
       COUNT(*) FILTER (WHERE status = 'submitted') AS awaiting_review,
       COUNT(*) FILTER (WHERE status = 'verified' AND verified_at >= NOW() - INTERVAL '7 days') AS completed_this_week,
       COUNT(*) FILTER (WHERE status = 'verified' AND verified_at >= NOW() - INTERVAL '30 days') AS completed_this_month,
       COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
       COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
       COUNT(*) AS total
     FROM tasks ${where}`,
    params
  );

  return result.rows[0];
}

// ── Bulk create ────────────────────────────────────────────────────────────

export async function bulkCreateTasks(items: CreateTaskInput[], createdById: string): Promise<TaskRow[]> {
  const tasks: TaskRow[] = [];
  for (const item of items) {
    const task = await createTask(item, createdById);
    tasks.push(task);
  }
  return tasks;
}
