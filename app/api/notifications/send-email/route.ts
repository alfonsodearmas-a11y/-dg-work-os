import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  renderInstantEmail,
  type EmailNotification,
} from '@/lib/notifications/email-templates';
import { entityUrl, isCronAuthorized } from '@/lib/notifications/email-utils';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// POST /api/notifications/send-email
// Processes queued instant email notifications (email_queued_at set, email_sent_at null).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Auth: cron secret OR any authenticated role
    if (!isCronAuthorized(request)) {
      const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
      if (authResult instanceof NextResponse) return authResult;
    }

    // 1. Fetch queued notifications (instant emails not yet sent)
    const { data: queued, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, actor_id, title, body, event_type, importance_tier, entity_type, entity_id, reference_url, created_at')
      .not('email_queued_at', 'is', null)
      .is('email_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      logger.error({ err: fetchError }, 'send-email: failed to fetch queued notifications');
      return NextResponse.json({ error: 'Failed to fetch queued notifications' }, { status: 500 });
    }

    if (!queued || queued.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0 });
    }

    // 2. Collect unique user IDs (recipients + actors) for batch lookup
    const userIds = new Set<string>();
    for (const n of queued) {
      userIds.add(n.user_id);
      if (n.actor_id) userIds.add(n.actor_id);
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(userIds));

    if (usersError) {
      logger.error({ err: usersError }, 'send-email: failed to fetch users');
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const userMap = new Map<string, { name: string; email: string }>();
    for (const u of users || []) {
      userMap.set(u.id, { name: u.name, email: u.email });
    }

    // 3. Process each notification
    let sent = 0;
    let failed = 0;

    for (const notif of queued) {
      try {
        const recipient = userMap.get(notif.user_id);
        if (!recipient?.email) {
          logger.warn({ userId: notif.user_id, notifId: notif.id }, 'send-email: no email for recipient, skipping');
          failed++;
          continue;
        }

        const actor = notif.actor_id ? userMap.get(notif.actor_id) : undefined;

        const emailNotif: EmailNotification = {
          title: notif.title,
          body: notif.body || undefined,
          event_type: notif.event_type || 'general',
          importance_tier: (['critical', 'important', 'informational'].includes(notif.importance_tier) ? notif.importance_tier : 'informational') as EmailNotification['importance_tier'],
          actor_name: actor?.name || undefined,
          entity_type: notif.entity_type || 'system',
          entity_url: entityUrl(notif),
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
          // Mark as sent
          const { error: updateError } = await supabaseAdmin
            .from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', notif.id);

          if (updateError) {
            logger.error({ err: updateError, notifId: notif.id }, 'send-email: sent but failed to update email_sent_at');
          }

          sent++;
        } else {
          logger.error({ notifId: notif.id, error: result.error }, 'send-email: sendEmail failed');
          failed++;
        }
      } catch (err) {
        logger.error({ err, notifId: notif.id }, 'send-email: unexpected error processing notification');
        failed++;
      }
    }

    logger.info({ sent, failed }, 'send-email: batch complete');
    return NextResponse.json({ success: true, sent, failed });
  } catch (err) {
    logger.error({ err }, 'send-email: unhandled error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
