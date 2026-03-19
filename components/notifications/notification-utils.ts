import type { Notification } from '@/lib/notifications';

/**
 * Resolve the URL a notification should navigate to when clicked.
 * Tries reference_url first, then builds from reference_type/id, then falls back to category.
 */
export function resolveNotificationUrl(n: Notification): string | null {
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
