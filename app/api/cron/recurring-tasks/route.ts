import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const secret = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  return secret.length === cronSecret.length && secret === cronSecret;
}

async function handleCron(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: templates, error: fetchError } = await supabaseAdmin
    .from('task_templates')
    .select('*')
    .eq('recurrence_enabled', true)
    .lte('next_occurrence', today)
    .not('recurrence_rule', 'is', null)
    .not('next_occurrence', 'is', null);

  if (fetchError) {
    logger.error({ err: fetchError }, 'Recurring tasks fetch error');
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let created = 0;

  for (const template of templates || []) {
    // Calculate due date from occurrence + offset
    const occurrence = new Date(template.next_occurrence + 'T00:00:00');
    const dueDate = new Date(occurrence);
    dueDate.setDate(dueDate.getDate() + (template.due_offset_days || 5));

    // Create the task
    const { error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: template.name,
        description: template.description,
        status: 'new',
        priority: template.priority || 'medium',
        agency: template.agency_slug,
        due_date: dueDate.toISOString().split('T')[0],
        owner_user_id: template.recurrence_assignee_id,
      });

    if (insertError) {
      logger.error({ err: insertError, templateId: template.id }, 'Failed to create recurring task');
      continue;
    }

    // Advance next_occurrence
    const next = new Date(occurrence);
    switch (template.recurrence_rule) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
    }

    await supabaseAdmin
      .from('task_templates')
      .update({ next_occurrence: next.toISOString().split('T')[0] })
      .eq('id', template.id);

    created++;
  }

  return NextResponse.json({ success: true, created, checked: templates?.length || 0 });
}

// Vercel crons use GET
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  return handleCron(request);
});
