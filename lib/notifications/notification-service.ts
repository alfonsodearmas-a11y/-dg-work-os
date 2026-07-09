import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import {
  classifyNotificationTier,
  type NotificationEventType,
  type TierContext,
  type ImportanceTier,
} from './classify-tier';
import { DEFAULT_EVENT_PREFERENCES, type EventPrefEntry } from '@/lib/notifications';
import { sendInstantEmailForNotification } from './send-instant-email';
import { NotificationDeliveryError } from './errors';

// Event types we emit a positive-signal "delivered" log for. Gated also by
// NOTIFICATIONS_DELIVERY_LOG env var so prod can disable without a code change.
// Rationale: detect future silent-failure regressions by absence of positive
// signal, not just by presence of error logs.
const LOUD_EVENT_TYPES: ReadonlySet<string> = new Set([
  'comment_mention',
  'task_assigned',
  'task_blocked',
]);

function deliveryLogEnabled(): boolean {
  return (process.env.NOTIFICATIONS_DELIVERY_LOG ?? 'on') !== 'off';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateNotificationParams {
  recipientId: string;
  actorId?: string;
  eventType: NotificationEventType;
  entityType: string;       // 'task' | 'comment' | 'project' | 'document'
  entityId: string;
  parentEntityType?: string;
  parentEntityId?: string;
  parentEntityTitle?: string;
  title: string;
  body?: string;
  referenceUrl?: string;     // URL path like '/tasks'
  metadata?: Record<string, unknown>;
  tierContext?: TierContext;
}

// Re-use the EventPrefEntry type from lib/notifications
type EventPreference = EventPrefEntry;

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  priority: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_url: string | null;
  scheduled_for: string;
  delivered_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  push_sent: boolean;
  created_at: string;
  category: string;
  source_module: string;
  action_required: boolean;
  action_type: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  actor_id: string | null;
  event_type: string | null;
  importance_tier: string | null;
  entity_type: string | null;
  entity_id: string | null;
  parent_entity_type: string | null;
  parent_entity_id: string | null;
  seen_at: string | null;
  email_sent_at: string | null;
  email_queued_at: string | null;
  digest_eligible: boolean;
  digest_batch_id: string | null;
}

// ---------------------------------------------------------------------------
// Default preferences when no row exists for the user / event type
// ---------------------------------------------------------------------------

// DEFAULT_EVENT_PREFERENCES imported from @/lib/notifications (single source of truth)
// Cast to Record<string, …> for string-key indexing in getUserEventPreferences
const DEFAULTS = DEFAULT_EVENT_PREFERENCES as Record<string, EventPreference>;
const FALLBACK_PREFERENCE: EventPreference = { in_app: true, email: 'off' };

// ---------------------------------------------------------------------------
// Helpers — pure mapping functions
// ---------------------------------------------------------------------------

function deriveCategory(entityType: string): string {
  switch (entityType) {
    case 'task':
    case 'comment':
      return 'tasks';
    case 'project':
      return 'projects';
    default:
      return 'system';
  }
}

function deriveIcon(eventType: NotificationEventType): string {
  switch (eventType) {
    case 'comment_mention':
    case 'comment_reply':
      return 'at-sign';
    case 'task_assigned':
    case 'task_status_change':
    case 'task_blocked':
    case 'task_due_soon':
    case 'task_completed':
    case 'subtask_completed':
    case 'outreach_assigned':
    case 'outreach_transferred':
      return 'task';
    default:
      return 'bell';
  }
}

function tierToPriority(tier: ImportanceTier): string {
  switch (tier) {
    case 'critical':
      return 'urgent';
    case 'important':
      return 'high';
    case 'informational':
    default:
      return 'medium';
  }
}

// ---------------------------------------------------------------------------
// getUserEventPreferences
// ---------------------------------------------------------------------------

export async function getUserEventPreferences(
  userId: string,
  eventType: string,
): Promise<EventPreference> {
  // Throws on database failure (raw pg error) so the caller can wrap it into
  // NotificationDeliveryError with full context. Silent default-on-error here
  // is exactly the masking pattern that hid the 2026-04-13 schema drift.
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('event_preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data?.event_preferences) {
    return DEFAULTS[eventType] ?? FALLBACK_PREFERENCE;
  }

  const prefs = data.event_preferences as Record<string, EventPreference>;
  if (prefs[eventType]) {
    return prefs[eventType];
  }

  return DEFAULTS[eventType] ?? FALLBACK_PREFERENCE;
}

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

export async function createNotification(
  params: CreateNotificationParams,
): Promise<NotificationRow | null> {
  const {
    recipientId,
    actorId,
    eventType,
    entityType,
    entityId,
    parentEntityType,
    parentEntityId,
    parentEntityTitle,
    title,
    body,
    referenceUrl,
    metadata,
    tierContext,
  } = params;

  // 1. Self-action suppression
  if (actorId && actorId === recipientId) {
    return null;
  }

  const mergedMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
    ...(parentEntityTitle ? { parentEntityTitle } : {}),
  };

  try {
    // 2. Classify tier
    const importanceTier = classifyNotificationTier(eventType, tierContext ?? {});

    // 3. Check user preferences — skip if in_app disabled
    const prefs = await getUserEventPreferences(recipientId, eventType);
    if (!prefs.in_app) {
      return null;
    }

    // 4. Rapid-fire dedup — same user + entity + event within last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: existing, error: dedupError } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('user_id', recipientId)
      .eq('entity_id', entityId)
      .eq('event_type', eventType)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dedupError) {
      logger.error({ err: dedupError, recipientId, eventType, entityId }, 'Dedup check failed');
      // Continue with insert — better to duplicate than to drop
    }

    if (existing) {
      // Update the existing row instead of inserting
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('notifications')
        .update({
          title,
          body: body ?? '',
          metadata: mergedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        throw new NotificationDeliveryError({
          eventType,
          recipientId,
          parentEntityType: parentEntityType ?? null,
          parentEntityId: parentEntityId ?? null,
          cause: updateError,
        });
      }

      logger.info({ notificationId: existing.id, eventType }, 'Notification deduped — updated existing row');
      return updated as NotificationRow;
    }

    // 5. Build the insert payload
    const now = new Date().toISOString();
    const priority = tierToPriority(importanceTier);
    const icon = deriveIcon(eventType);
    const category = deriveCategory(entityType);

    const insertPayload: Record<string, unknown> = {
      user_id: recipientId,
      actor_id: actorId ?? null,
      type: eventType,
      event_type: eventType,
      importance_tier: importanceTier,
      title,
      body: body ?? '',
      entity_type: entityType,
      entity_id: entityId,
      parent_entity_type: parentEntityType ?? null,
      parent_entity_id: parentEntityId ?? null,
      reference_type: entityType,
      reference_id: entityId,
      reference_url: referenceUrl ?? null,
      scheduled_for: now,
      category,
      source_module: 'notifications-v2',
      priority,
      icon,
      metadata: mergedMetadata,
    };

    // 6. Email handling
    if (prefs.email === 'instant') {
      insertPayload.email_queued_at = now;
    } else if (prefs.email === 'digest') {
      insertPayload.digest_eligible = true;
    }
    // 'off' — leave email_queued_at null and digest_eligible false (defaults)

    // 7. Insert
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      throw new NotificationDeliveryError({
        eventType,
        recipientId,
        parentEntityType: parentEntityType ?? null,
        parentEntityId: parentEntityId ?? null,
        cause: insertError,
      });
    }

    // Positive-signal "delivered" log — gated by env + event type. Detects
    // future silent-failure regressions by absence-of-positive-signal.
    if (deliveryLogEnabled() && LOUD_EVENT_TYPES.has(eventType)) {
      logger.info(
        {
          user_id: recipientId,
          event_type: eventType,
          parent_entity_type: parentEntityType ?? null,
          parent_entity_id: parentEntityId ?? null,
          notification_id: inserted.id,
        },
        '[notifications] delivered',
      );
    }

    // 8. Fire-and-forget instant email (non-blocking)
    if (prefs.email === 'instant' && inserted) {
      sendInstantEmailForNotification(inserted as NotificationRow).catch((err) =>
        logger.error({ err, notificationId: inserted.id }, 'Inline instant email failed'),
      );
    }

    return inserted as NotificationRow;
  } catch (err) {
    if (err instanceof NotificationDeliveryError) throw err;
    throw new NotificationDeliveryError({
      eventType,
      recipientId,
      parentEntityType: parentEntityType ?? null,
      parentEntityId: parentEntityId ?? null,
      cause: err,
    });
  }
}

// ---------------------------------------------------------------------------
// createBulkNotifications
// ---------------------------------------------------------------------------

export async function createBulkNotifications(
  paramsList: CreateNotificationParams[],
): Promise<NotificationRow[]> {
  const results: NotificationRow[] = [];

  // Create all individual notifications
  for (const params of paramsList) {
    try {
      const result = await createNotification(params);
      if (result) {
        results.push(result);
      }
    } catch (err) {
      logger.error(
        { err, recipientId: params.recipientId, eventType: params.eventType },
        'Failed to create notification in bulk batch',
      );
    }
  }

  // Batch collapsing — check for >5 notifications of the same event_type
  // for the same recipient within the last hour
  try {
    await collapseExcessiveNotifications(results);
  } catch (err) {
    logger.error({ err }, 'Failed during batch collapse phase');
  }

  return results;
}

// ---------------------------------------------------------------------------
// Batch collapse helper
// ---------------------------------------------------------------------------

async function collapseExcessiveNotifications(
  created: NotificationRow[],
): Promise<void> {
  // Group the created notifications by recipient + event_type
  const groups = new Map<string, NotificationRow[]>();

  for (const notif of created) {
    const key = `${notif.user_id}::${notif.event_type}`;
    const group = groups.get(key);
    if (group) {
      group.push(notif);
    } else {
      groups.set(key, [notif]);
    }
  }

  const groupKeys = Array.from(groups.keys());
  for (const key of groupKeys) {
    const group = groups.get(key)!;
    if (group.length <= 5) continue;

    const recipientId = group[0].user_id;
    const eventType = group[0].event_type ?? group[0].type;

    // Check how many total exist for this recipient + event_type in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentRows, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, title, body, entity_id, entity_type, metadata')
      .eq('user_id', recipientId)
      .eq('event_type', eventType)
      .gte('created_at', oneHourAgo)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError || !recentRows || recentRows.length <= 5) continue;

    const count = recentRows.length;
    const entityLabel = group[0].entity_type ?? 'items';
    const collapsedTitle = `${count} ${entityLabel}s were updated`;

    // Collect summary items from the rows we are about to delete (cap at 10 to bound metadata size)
    const collapsedItems = recentRows.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title,
      entity_id: r.entity_id,
      entity_type: r.entity_type,
    }));

    const idsToDelete = recentRows.slice(1).map((r) => r.id);
    const keepId = recentRows[0].id;

    // Update the most recent one to be the collapsed notification
    const { error: collapseUpdateError } = await supabaseAdmin
      .from('notifications')
      .update({
        title: collapsedTitle,
        body: `${count} ${eventType?.replace(/_/g, ' ')} notifications in the last hour`,
        metadata: {
          ...(recentRows[0].metadata as Record<string, unknown> ?? {}),
          collapsed: true,
          collapsed_count: count,
          collapsed_items: collapsedItems,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', keepId);

    if (collapseUpdateError) {
      logger.error(
        { err: collapseUpdateError, recipientId, eventType },
        'Failed to update collapsed notification',
      );
      continue;
    }

    // Delete the individual rows
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('notifications')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        logger.error(
          { err: deleteError, recipientId, eventType, count: idsToDelete.length },
          'Failed to delete collapsed notification rows',
        );
        continue;
      }
    }

    // Update the results array — remove deleted, update the kept one
    const deletedSet = new Set(idsToDelete);
    for (let i = created.length - 1; i >= 0; i--) {
      if (deletedSet.has(created[i].id)) {
        created.splice(i, 1);
      } else if (created[i].id === keepId) {
        created[i].title = collapsedTitle;
        created[i].metadata = {
          collapsed: true,
          collapsed_count: count,
          collapsed_items: collapsedItems,
        };
      }
    }

    logger.info(
      { recipientId, eventType, collapsed: count, kept: keepId },
      'Collapsed excessive notifications into single row',
    );
  }
}
