/**
 * Shared task permission helpers — currently focused on watcher management.
 * Used both server-side (route handlers) and client-side (TaskDetailPanel) so
 * the rule lives in exactly one place.
 */

interface MinimalTask {
  owner_user_id: string | null;
  assigned_by_user_id?: string | null;
}

interface MinimalSession {
  user?: { id?: string | null; role?: string | null } | null;
}

/** Can the current user manage the watcher list (add others, remove others)? */
export function canManageWatchers(
  task: MinimalTask,
  session: MinimalSession | null | undefined,
): boolean {
  const userId = session?.user?.id;
  if (!userId) return false;
  if (session.user?.role === 'superadmin') return true;
  if (task.owner_user_id === userId) return true;
  if (task.assigned_by_user_id === userId) return true;
  return false;
}

/** Can the current user remove a specific watcher? Self-removal is always allowed. */
export function canRemoveWatcher(
  task: MinimalTask,
  session: MinimalSession | null | undefined,
  watcherUserId: string,
): boolean {
  const userId = session?.user?.id;
  if (!userId) return false;
  if (userId === watcherUserId) return true;
  return canManageWatchers(task, session);
}
