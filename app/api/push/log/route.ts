import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { auth } from '@/lib/auth';

// Use Supabase for persistent logging across serverless invocations
// Stores in a simple key-value approach using the notifications table metadata

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry = {
      event: String((body as Record<string, unknown>).event || 'unknown'),
      detail: String((body as Record<string, unknown>).detail || ''),
    };

    // Use session user ID when available, fall back to body user_id (SW context)
    const session = await auth();
    const userId = session?.user?.id || String((body as Record<string, unknown>).user_id || 'system');

    // Store as a special notification type for debugging
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'meeting_starting', // use a valid type
      title: `[SW_LOG] ${entry.event}`,
      body: entry.detail,
      priority: 'low',
      scheduled_for: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Fetch recent SW logs (last 20 entries where title starts with [SW_LOG])
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('title, body, created_at')
    .like('title', '[SW_LOG]%')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: String(error) });
  }

  return NextResponse.json({
    log: (data || []).map((d: { title: string; body: string; created_at: string }) => ({
      timestamp: d.created_at,
      event: d.title.replace('[SW_LOG] ', ''),
      detail: d.body,
    })),
  });
}
