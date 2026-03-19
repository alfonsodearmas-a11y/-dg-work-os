import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  renderDigestEmail,
  type EmailNotification,
} from '@/lib/notifications/email-templates';
import { entityUrl, isCronAuthorized } from '@/lib/notifications/email-utils';
import { logger } from '@/lib/logger';

interface NotifRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  title: string;
  body: string | null;
  event_type: string | null;
  importance_tier: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// POST /api/notifications/digest
// Sends daily digest emails to users with digest-eligible notifications.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Auth: cron secret OR DG role
    if (!isCronAuthorized(request)) {
      const authResult = await requireRole(['dg']);
      if (authResult instanceof NextResponse) return authResult;
    }

    // 1. Fetch all digest-eligible notifications not yet emailed
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, actor_id, title, body, event_type, importance_tier, entity_type, entity_id, reference_url, created_at')
      .eq('digest_eligible', true)
      .is('email_sent_at', null)
      .order('user_id')
      .order('created_at');

    if (fetchError) {
      logger.error({ err: fetchError }, 'digest: failed to fetch eligible notifications');
      return NextResponse.json({ error: 'Failed to fetch digest notifications' }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, recipients: 0, notifications: 0 });
    }

    // 2. Group notifications by user_id and collect all user IDs in one pass
    const groupedByUser = new Map<string, NotifRow[]>();
    const allUserIds = new Set<string>();
    for (const row of rows as NotifRow[]) {
      const group = groupedByUser.get(row.user_id);
      if (group) { group.push(row); } else { groupedByUser.set(row.user_id, [row]); }
      allUserIds.add(row.user_id);
      if (row.actor_id) allUserIds.add(row.actor_id);
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(allUserIds));

    if (usersError) {
      logger.error({ err: usersError }, 'digest: failed to fetch users');
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const userMap = new Map<string, { name: string; email: string }>();
    for (const u of users || []) {
      userMap.set(u.id, { name: u.name, email: u.email });
    }

    // 4. Fetch notification preferences for all recipients
    const recipientIds = Array.from(groupedByUser.keys());
    const { data: prefsRows, error: prefsError } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, digest_frequency, digest_time, event_preferences')
      .in('user_id', recipientIds);

    if (prefsError) {
      logger.error({ err: prefsError }, 'digest: failed to fetch preferences');
      // Continue with defaults — don't block sending
    }

    const prefsMap = new Map<string, { digest_frequency: string; digest_time: string; event_preferences: Record<string, unknown> }>();
    for (const p of prefsRows || []) {
      prefsMap.set(p.user_id, {
        digest_frequency: p.digest_frequency || 'daily',
        digest_time: p.digest_time || '07:00',
        event_preferences: (p.event_preferences as Record<string, unknown>) || {},
      });
    }

    // 5. Process each recipient group
    let recipientsSent = 0;
    let totalNotificationsSent = 0;

    for (const [userId, notifs] of Array.from(groupedByUser.entries())) {
      try {
        // Check digest preferences
        const prefs = prefsMap.get(userId);
        if (prefs?.digest_frequency === 'off') {
          logger.info({ userId }, 'digest: user has digest turned off, skipping');
          continue;
        }

        const recipient = userMap.get(userId);
        if (!recipient?.email) {
          logger.warn({ userId }, 'digest: no email for recipient, skipping');
          continue;
        }

        // Build actor name map for this group
        const emailNotifs: EmailNotification[] = notifs.map((n) => {
          const actor = n.actor_id ? userMap.get(n.actor_id) : undefined;
          return {
            title: n.title,
            body: n.body || undefined,
            event_type: n.event_type || 'general',
            importance_tier: (['critical', 'important', 'informational'].includes(n.importance_tier as string) ? n.importance_tier : 'informational') as EmailNotification['importance_tier'],
            actor_name: actor?.name || undefined,
            entity_type: n.entity_type || 'system',
            entity_url: entityUrl(n),
            created_at: n.created_at,
          };
        });

        // Extract first name for greeting
        const firstName = recipient.name?.split(' ')[0] || recipient.name || 'there';

        const rendered = renderDigestEmail(emailNotifs, firstName);

        const result = await sendEmail({
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        if (result.success) {
          // Mark all notifications in this group as email_sent
          const notifIds = notifs.map((n) => n.id);
          const { error: updateError } = await supabaseAdmin
            .from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .in('id', notifIds);

          if (updateError) {
            logger.error({ err: updateError, userId, count: notifIds.length }, 'digest: sent but failed to update email_sent_at');
          }

          recipientsSent++;
          totalNotificationsSent += notifs.length;
        } else {
          logger.error({ userId, error: result.error }, 'digest: sendEmail failed for recipient');
        }
      } catch (err) {
        logger.error({ err, userId }, 'digest: unexpected error processing recipient');
      }
    }

    logger.info({ recipientsSent, totalNotificationsSent }, 'digest: batch complete');
    return NextResponse.json({
      success: true,
      recipients: recipientsSent,
      notifications: totalNotificationsSent,
    });
  } catch (err) {
    logger.error({ err }, 'digest: unhandled error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
