import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { auth } from '@/lib/auth';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const logSchema = z.object({
  event: z.string().optional(),
  detail: z.string().optional(),
  user_id: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { data, error } = await parseBody(request, logSchema);
  if (error) return error;

  const entry = {
    event: data!.event || 'unknown',
    detail: data!.detail || '',
  };

  const session = await auth(); // TODO: migrate to requireRole()
  const userId = session?.user?.id || data!.user_id || 'system';

  await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type: 'meeting_starting',
    title: `[SW_LOG] ${entry.event}`,
    body: entry.detail,
    priority: 'low',
    scheduled_for: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
});

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
