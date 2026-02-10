import { createTask as createNotionTask, updateTask as updateNotionTask } from './notion';
import { query } from './db-pg';
import type { TaskRow, TaskStatus } from './task-queries';

// ── Status mapping: PG task status → Notion status ─────────────────────────

function mapStatusToNotion(status: TaskStatus): 'To Do' | 'In Progress' | 'Done' {
  switch (status) {
    case 'assigned':
    case 'acknowledged':
      return 'To Do';
    case 'in_progress':
    case 'submitted':
    case 'rejected':
    case 'overdue':
      return 'In Progress';
    case 'verified':
      return 'Done';
    default:
      return 'To Do';
  }
}

function mapPriorityToNotion(p: string): 'High' | 'Medium' | 'Low' {
  if (p === 'critical' || p === 'high') return 'High';
  if (p === 'low') return 'Low';
  return 'Medium';
}

// ── Sync a single task to Notion ───────────────────────────────────────────

export async function syncTaskToNotion(task: TaskRow): Promise<string | null> {
  try {
    // Look up assignee's notion_user_id if available
    let notionUserId: string | null = null;
    if (task.assignee_id) {
      const userResult = await query('SELECT notion_user_id FROM users WHERE id = $1', [task.assignee_id]);
      notionUserId = userResult.rows[0]?.notion_user_id || null;
    }

    const notionStatus = mapStatusToNotion(task.status);
    const notionPriority = mapPriorityToNotion(task.priority);

    if (task.notion_page_id) {
      // Update existing Notion page
      await updateNotionTask(task.notion_page_id, {
        title: task.title,
        status: notionStatus,
        due_date: task.due_date || null,
        agency: task.agency?.toUpperCase() || null,
        priority: notionPriority,
      });

      // Update sync timestamp
      await query(
        'UPDATE tasks SET last_notion_sync_at = NOW() WHERE id = $1',
        [task.id]
      );

      return task.notion_page_id;
    } else {
      // Create new Notion page
      const descLines: string[] = [];
      if (task.description) descLines.push(task.description);
      if (task.assignee_name) descLines.push(`\nAssigned to: ${task.assignee_name}`);

      const notionTask = await createNotionTask({
        title: task.title,
        status: notionStatus,
        due_date: task.due_date || null,
        agency: task.agency?.toUpperCase() || null,
        role: 'Task Assignment',
        priority: notionPriority,
        description: descLines.join('\n') || null,
      });

      // Save notion_page_id back to tasks table
      await query(
        'UPDATE tasks SET notion_page_id = $1, last_notion_sync_at = NOW() WHERE id = $2',
        [notionTask.notion_id, task.id]
      );

      // Log activity
      await query(
        `INSERT INTO task_activities (task_id, action, to_value)
         VALUES ($1, 'notion_synced', $2)`,
        [task.id, notionTask.notion_id]
      );

      return notionTask.notion_id;
    }
  } catch (error: any) {
    console.error(`[notion-sync] Failed to sync task ${task.id}:`, error.message);
    return null;
  }
}

// ── Batch sync all tasks updated since last sync ───────────────────────────

export async function syncAllPendingTasks(): Promise<{ synced: number; failed: number }> {
  const result = await query(
    `SELECT t.*, a.full_name AS assignee_name
     FROM tasks t
     LEFT JOIN users a ON a.id = t.assignee_id
     WHERE t.last_notion_sync_at IS NULL
        OR t.updated_at > t.last_notion_sync_at`
  );

  let synced = 0;
  let failed = 0;

  for (const task of result.rows) {
    const pageId = await syncTaskToNotion(task);
    if (pageId) {
      synced++;
    } else {
      failed++;
    }
  }

  console.log(`[notion-sync] Batch sync: ${synced} synced, ${failed} failed out of ${result.rows.length} tasks`);
  return { synced, failed };
}
