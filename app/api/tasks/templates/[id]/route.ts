import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const patchTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  agency_slug: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  checklist: z.array(z.unknown()).optional(),
  recurrence_rule: z.string().optional(),
  recurrence_enabled: z.boolean().optional(),
  recurrence_assignee_id: z.string().optional(),
  next_occurrence: z.string().optional(),
  due_offset_days: z.number().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'No valid fields to update' });

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['dg', 'minister', 'ps']);
  if (result instanceof NextResponse) return result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error: validationError } = await parseBody(request, patchTemplateSchema);
  if (validationError) return validationError;

  const updates: Record<string, unknown> = {};
  const allowed = [
    'name', 'description', 'agency_slug', 'priority', 'checklist',
    'recurrence_rule', 'recurrence_enabled', 'recurrence_assignee_id',
    'next_occurrence', 'due_offset_days',
  ] as const;

  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  const { data: template, error } = await supabaseAdmin
    .from('task_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  return NextResponse.json({ template });
});
