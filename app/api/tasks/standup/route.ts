import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  // Fetch active + blocked tasks
  const { data: activeTasks } = await supabaseAdmin
    .from('tasks')
    .select('title, status, agency, priority, due_date, blocked_reason, owner:users!owner_user_id(name)')
    .in('status', ['active', 'blocked'])
    .order('due_date', { ascending: true });

  // Fetch overdue tasks
  const today = new Date().toISOString().split('T')[0];
  const { data: overdueTasks } = await supabaseAdmin
    .from('tasks')
    .select('title, status, agency, priority, due_date, owner:users!owner_user_id(name)')
    .lt('due_date', today)
    .neq('status', 'done')
    .order('due_date', { ascending: true });

  const formatTask = (t: Record<string, unknown>) => {
    const owner = t.owner as { name: string } | null;
    const parts = [`- ${t.title}`];
    if (t.agency) parts.push(`[${t.agency}]`);
    if (t.status) parts.push(`(${t.status})`);
    if (owner?.name) parts.push(`assigned to ${owner.name}`);
    if (t.due_date) parts.push(`due ${t.due_date}`);
    if (t.blocked_reason) parts.push(`blocked: ${t.blocked_reason}`);
    return parts.join(' ');
  };

  const activeText = (activeTasks || []).map(formatTask).join('\n') || 'None';
  const overdueText = (overdueTasks || []).map(formatTask).join('\n') || 'None';

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are briefing the Director General of Guyana's Ministry of Public Utilities and Aviation.

Produce a concise standup digest in plain English. Maximum 12 lines. No bullet point symbols — use clean numbered lines or short paragraphs.

Cover:
1. What is actively in progress (grouped by agency if possible)
2. What is blocked and why
3. What is overdue and by how long
4. Any pattern worth flagging (e.g. multiple GPL tasks blocked, no GWI activity)

Active tasks:
${activeText}

Overdue tasks:
${overdueText}

Be direct. This is an executive briefing, not a status report.`,
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  return NextResponse.json({ digest: text });
}
