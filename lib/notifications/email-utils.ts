import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Shared utilities for notification email routes (send-email + digest).
 */

let _baseUrlWarned = false;

export function getAppBaseUrl(): string {
  const url =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : '');

  if (!url && !_baseUrlWarned) {
    _baseUrlWarned = true;
    logger.warn('email-utils: getAppBaseUrl(): no NEXTAUTH_URL or VERCEL_URL set — email links will be relative paths');
  }

  return url;
}

export function entityUrl(notif: {
  reference_url?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
}): string {
  const base = getAppBaseUrl();
  if (notif.reference_url && notif.reference_url !== '/') return `${base}${notif.reference_url}`;
  // Deep-link a task email straight to the task on the board.
  if (notif.entity_type === 'task' && notif.entity_id) return `${base}/tasks?taskId=${notif.entity_id}`;
  if (notif.entity_type === 'task') return `${base}/tasks`;
  if (notif.entity_type === 'project' && notif.entity_id) return `${base}/projects/${notif.entity_id}`;
  return base;
}

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = request.headers.get('x-cron-secret')
    || request.headers.get('authorization')?.replace('Bearer ', '');
  return !!secret && !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}
