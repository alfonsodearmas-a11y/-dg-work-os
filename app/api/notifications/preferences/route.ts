import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, updatePreferences } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id') || 'dg';
    const prefs = await getPreferences(userId);
    return NextResponse.json(prefs);
  } catch (err) {
    console.error('GET /api/notifications/preferences error:', err);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, ...prefs } = body;
    const updated = await updatePreferences(user_id || 'dg', prefs);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PUT /api/notifications/preferences error:', err);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
