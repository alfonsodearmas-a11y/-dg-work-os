import { NextRequest, NextResponse } from 'next/server';
import {
  saveSubscription,
  deleteSubscriptionByEndpoint,
  getAllSubscriptionsForUser,
  deleteSubscription,
} from '@/lib/push';

// Register or update a push subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, subscription } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const record = await saveSubscription(user_id || 'dg', subscription, userAgent);

    return NextResponse.json({ success: true, subscription: record });
  } catch (err) {
    console.error('POST /api/push/subscribe error:', err);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}

// List subscriptions for a user
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id') || 'dg';
    const subscriptions = await getAllSubscriptionsForUser(userId);
    return NextResponse.json({ subscriptions });
  } catch (err) {
    console.error('GET /api/push/subscribe error:', err);
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
    console.error('DELETE /api/push/subscribe error:', err);
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}
