'use client';

import { useMemo } from 'react';
import { useNotifications as useNotificationContext } from '@/components/notifications/NotificationProvider';
import type { Notification } from '@/lib/notifications';

export type TierFilter = 'all' | 'critical' | 'important' | 'informational' | 'mentions';

export function useNotificationsWithTiers() {
  const ctx = useNotificationContext();

  // Single-pass computation of all tier/mention counts
  const { criticalCount, importantCount, mentionCount } = useMemo(() => {
    let critical = 0, important = 0, mentions = 0;
    for (const n of ctx.notifications) {
      if (n.read_at) continue;
      if (n.importance_tier === 'critical') critical++;
      if (n.importance_tier === 'important') important++;
      if (n.event_type === 'comment_mention' || n.event_type === 'comment_reply') mentions++;
    }
    return { criticalCount: critical, importantCount: important, mentionCount: mentions };
  }, [ctx.notifications]);

  const filterByTier = useMemo(
    () =>
      (tier: TierFilter): Notification[] => {
        if (tier === 'all') return ctx.notifications;
        if (tier === 'mentions')
          return ctx.notifications.filter(
            n => n.event_type === 'comment_mention' || n.event_type === 'comment_reply'
          );
        return ctx.notifications.filter(n => n.importance_tier === tier);
      },
    [ctx.notifications]
  );

  return {
    ...ctx,
    criticalCount,
    importantCount,
    mentionCount,
    filterByTier,
  };
}
