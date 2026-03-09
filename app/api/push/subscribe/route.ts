import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  saveSubscription,
  deleteSubscriptionByEndpoint,
  getAllSubscriptionsForUser,
  deleteSubscription,
} from '@/lib/push';
import { parseBody, withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  user_id: z.string().min(1).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { data, error } = await parseBody(request, subscribeSchema);
  if (error) return error;

  const session = await auth();
  const userId = session?.user?.id || data!.user_id;

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent') || '';
  const record = await saveSubscription(userId, data!.subscription, userAgent);

  return NextResponse.json({ success: true, subscription: record });
});

// List subscriptions for a user — requires auth
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const subscriptions = await getAllSubscriptionsForUser(session.user.id);
    return NextResponse.json({ subscriptions });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch push subscriptions');
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

// Unsubscribe — delete by endpoint or by ID
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.endpoint) {
      await deleteSubscriptionByEndpoint(body.endpoint);
    } else if (body.id) {
      await deleteSubscription(body.id);
    } else {
      return NextResponse.json({ error: 'endpoint or id required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete push subscription');
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}
