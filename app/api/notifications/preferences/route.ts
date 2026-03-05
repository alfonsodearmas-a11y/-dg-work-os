import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPreferences, updatePreferences } from '@/lib/notifications';

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const prefs = await getPreferences(userId);
    return NextResponse.json(prefs);
  } catch (err) {
    console.error('GET /api/notifications/preferences error:', err);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const prefs = await request.json();
    const updated = await updatePreferences(userId, prefs);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PUT /api/notifications/preferences error:', err);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
