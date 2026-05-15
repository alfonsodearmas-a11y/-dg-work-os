import type { Notification } from '@/lib/notifications';
import { commentDeepLinkPath } from '@/lib/notifications/deep-link';

/**
 * Resolve the URL a notification should navigate to when clicked.
 * Comment rows derive from the parent entity. Otherwise: reference_url first,
 * then build from reference_type/id, then fall back to category.
 */
export function resolveNotificationUrl(n: Notification): string | null {
  if (n.entity_type === 'comment') {
    const path = commentDeepLinkPath(n.parent_entity_type, n.parent_entity_id, n.entity_id);
    if (path) return path;
    // Fall through if the parent type is not yet wired in deep-link.ts.
  }

  // Use reference_url if it's a meaningful deep link (not just '/')
  if (n.reference_url && n.reference_url !== '/') return n.reference_url;

  // Fallback: build URL from reference_type + reference_id + metadata
  const id = n.reference_id;
  const agency = (n.metadata?.agency as string)?.toLowerCase();

  switch (n.reference_type) {
    case 'task':
      return '/tasks';
    case 'meeting':
      return id ? `/meetings/${id}` : '/meetings';
    case 'project':
      return id ? `/projects/${id}` : '/projects';
    case 'kpi':
      return agency ? `/intel/${agency}` : '/intel';
    case 'oversight':
      return '/oversight';
    case 'document':
      return id ? `/documents/${id}` : '/documents';
    default:
      break;
  }

  // Fallback by category
  switch (n.category) {
    case 'meetings': return '/meetings';
    case 'tasks': return '/tasks';
    case 'projects': return '/projects';
    case 'kpi': return '/intel';
    case 'oversight': return '/oversight';
    default: return null;
  }
}
