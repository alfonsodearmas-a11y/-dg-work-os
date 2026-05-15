// Pure path builders for notification deep links. No base URL, no env access,
// safe to import from both server (email rendering) and client (in-app click).
//
// Scoped intentionally narrow: only `parent_entity_type === 'task'` is wired
// today because that is the only surface that emits @mention notifications.
// Other entity types fall through and the caller renders a generic landing.

export function parentDeepLinkPath(
  parentEntityType: string | null | undefined,
  parentEntityId: string | null | undefined,
): string | null {
  if (!parentEntityId) return null;
  switch (parentEntityType) {
    case 'task':
      return `/tasks?taskId=${parentEntityId}`;
    default:
      return null;
  }
}

/**
 * Build a deep link to a specific comment inside its parent entity.
 *
 * Comment rows always derive from the parent entity. Callers (`entityUrl` for
 * emails and `resolveNotificationUrl` for in-app clicks) ignore the row's
 * `reference_url` because legacy code wrote a generic '/tasks' path that
 * discards the comment anchor.
 */
export function commentDeepLinkPath(
  parentEntityType: string | null | undefined,
  parentEntityId: string | null | undefined,
  commentId: string | null | undefined,
): string | null {
  if (!commentId) return null;
  const parent = parentDeepLinkPath(parentEntityType, parentEntityId);
  if (!parent) return null;
  const sep = parent.includes('?') ? '&' : '?';
  return `${parent}${sep}commentId=${commentId}#comment-${commentId}`;
}
