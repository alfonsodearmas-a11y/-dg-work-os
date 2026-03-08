import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const userId = session.user.id;

  // 1. VAPID key info
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || '';
  const nextPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  // 2. Configure VAPID
  let vapidConfigured = false;
  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webpush.setVapidDetails(
        vapidSubject || 'mailto:admin@dgworkos.gov.gy',
        vapidPublicKey,
        vapidPrivateKey
      );
      vapidConfigured = true;
    } catch (e) {
      return NextResponse.json({
        error: 'VAPID configuration failed',
        vapid_public_key_length: vapidPublicKey.length,
        vapid_private_key_length: vapidPrivateKey.length,
      });
    }
  }

  // 3. Get ALL subscriptions (active and inactive)
  const { data: allSubs, error: subError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (subError) {
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  // 4. For each active subscription, try sending a MINIMAL payload
  const minimalPayload = JSON.stringify({
    title: 'Test from DG Work OS',
    body: 'This is a test notification',
  });

  const results = [];
  for (const sub of allSubs || []) {
    const result: Record<string, unknown> = {
      id: sub.id,
      endpoint_domain: new URL(sub.endpoint).hostname,
      platform: sub.platform,
      active: sub.active,
      created_at: sub.created_at,
      last_used_at: sub.last_used_at,
    };

    if (!sub.active) {
      result.send_result = { skipped: true, reason: 'inactive' };
      results.push(result);
      continue;
    }

    if (!vapidConfigured) {
      result.send_result = { skipped: true, reason: 'vapid_not_configured' };
      results.push(result);
      continue;
    }

    try {
      const response = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        minimalPayload,
        { TTL: 60 }
      );

      result.send_result = {
        success: true,
        statusCode: response.statusCode,
      };
    } catch (err: unknown) {
      const e = err as {
        statusCode?: number;
        message?: string;
        code?: string;
      };
      result.send_result = {
        success: false,
        statusCode: e.statusCode,
        message: e.message,
        code: e.code,
      };
    }

    results.push(result);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    user_id: userId,
    vapid_configured: vapidConfigured,
    vapid_public_key_length: vapidPublicKey.length,
    next_public_key_length: nextPublicKey.length,
    total_subscriptions: (allSubs || []).length,
    active_subscriptions: (allSubs || []).filter((s: { active: boolean }) => s.active).length,
    subscriptions: results,
  });
});
