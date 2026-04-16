import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendInstantEmailForNotification } from '@/lib/notifications/send-instant-email';
import { isCronAuthorized } from '@/lib/notifications/email-utils';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// POST /api/notifications/send-email
// Processes queued instant email notifications (email_queued_at set, email_sent_at null).
// ---------------------------------------------------------------------------

// Vercel crons use GET — export the same handler for both methods
export { handleSendEmail as GET };

export async function POST(request: NextRequest) {
  return handleSendEmail(request);
}

async function handleSendEmail(request: NextRequest) {
  try {
    // Auth: cron secret OR any authenticated role
    if (!isCronAuthorized(request)) {
      const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
      if (authResult instanceof NextResponse) return authResult;
    }

    // Fetch queued notifications (instant emails not yet sent)
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

    // Process each notification using the shared email sender
    let sent = 0;
    let failed = 0;

    for (const notif of queued) {
      const ok = await sendInstantEmailForNotification(notif);
      if (ok) { sent++; } else { failed++; }
    }

    logger.info({ sent, failed }, 'send-email: batch complete');
    return NextResponse.json({ success: true, sent, failed });
  } catch (err) {
    logger.error({ err }, 'send-email: unhandled error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
