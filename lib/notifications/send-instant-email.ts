import { supabaseAdmin } from '@/lib/db-admin';
import { sendEmail } from '@/lib/email';
import { renderInstantEmail, type EmailNotification } from './email-templates';
import { entityUrl } from './email-utils';
import { logger } from '@/lib/logger';
import type { ImportanceTier } from './classify-tier';

/**
 * Send an instant email for a single notification row and mark it as sent.
 * Designed to be called fire-and-forget after createNotification().
 * Does not throw — logs errors and returns false.
 */
export async function sendInstantEmailForNotification(notif: {
  id: string;
  user_id: string;
  actor_id?: string | null;
  title: string;
  body?: string | null;
  event_type?: string | null;
  importance_tier?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  parent_entity_type?: string | null;
  parent_entity_id?: string | null;
  reference_url?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}): Promise<boolean> {
  try {
    // Look up recipient (and optionally actor) in one query
    const userIds = [notif.user_id];
    if (notif.actor_id) userIds.push(notif.actor_id);

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', userIds);

    if (usersError) {
      logger.error({ err: usersError, notifId: notif.id }, 'send-instant-email: failed to fetch users');
      return false;
    }

    const userMap = new Map<string, { name: string; email: string }>();
    for (const u of users || []) {
      userMap.set(u.id, { name: u.name, email: u.email });
    }

    const recipient = userMap.get(notif.user_id);
    if (!recipient?.email) {
      logger.warn({ userId: notif.user_id, notifId: notif.id }, 'send-instant-email: no email for recipient');
      return false;
    }

    const actor = notif.actor_id ? userMap.get(notif.actor_id) : undefined;

    const VALID_TIERS: ImportanceTier[] = ['critical', 'important', 'informational'];
    const tier = (VALID_TIERS.includes(notif.importance_tier as ImportanceTier)
      ? notif.importance_tier
      : 'informational') as ImportanceTier;

    const parentEntityTitle =
      typeof notif.metadata?.parentEntityTitle === 'string'
        ? notif.metadata.parentEntityTitle || undefined
        : undefined;

    const emailNotif: EmailNotification = {
      title: notif.title,
      body: notif.body || undefined,
      event_type: notif.event_type || 'general',
      importance_tier: tier,
      actor_name: actor?.name || undefined,
      entity_type: notif.entity_type || 'system',
      entity_url: entityUrl(notif),
      parent_entity_type: notif.parent_entity_type || undefined,
      parent_entity_title: parentEntityTitle,
      created_at: notif.created_at,
    };

    const rendered = renderInstantEmail(emailNotif);

    const result = await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (result.success) {
      const { error: updateError } = await supabaseAdmin
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', notif.id);

      if (updateError) {
        logger.error({ err: updateError, notifId: notif.id }, 'send-instant-email: sent but failed to update email_sent_at');
      }

      return true;
    }

    logger.error({ notifId: notif.id, error: result.error }, 'send-instant-email: sendEmail failed');
    return false;
  } catch (err) {
    logger.error({ err, notifId: notif.id }, 'send-instant-email: unexpected error');
    return false;
  }
}
