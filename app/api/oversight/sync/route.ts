import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { parseBody } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const secret = request.headers.get('authorization')?.replace('Bearer ', '') || '';
  return secret.length === cronSecret.length && secret === cronSecret;
}

const ProjectSchema = z.object({
  project_id: z.number().int(),
  project_reference: z.string().optional().nullable(),
  executing_agency: z.string().default('MOPUA'),
  sub_agency: z.string(),
  project_name: z.string(),
  region: z.number().int().min(1).max(10).optional().nullable(),
  tender_board_type: z.string().optional().nullable(),
  contract_lots: z.array(z.object({
    contractor: z.string(),
    value: z.number(),
  })).optional().default([]),
  contractor: z.string().optional().nullable(),
  contract_value: z.number().optional().nullable(),
  project_end_date: z.string().optional().nullable(),
  project_status: z.string().optional().default('DELAYED'),
  completion_percent: z.number().min(0).max(100).optional().default(0),
  has_images: z.number().int().optional().default(0),
});

const SyncSchema = z.object({
  projects: z.array(ProjectSchema).min(1),
});

export async function POST(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(request, SyncSchema);
  if (parsed.error) return parsed.error;

  const { projects } = parsed.data;
  const now = new Date().toISOString();

  const rows = projects.map((p) => {
    let lots = p.contract_lots;
    if ((!lots || lots.length === 0) && p.contractor && p.contract_value) {
      lots = [{ contractor: p.contractor, value: p.contract_value }];
    }

    const contractors = lots.map((l) => l.contractor).filter(Boolean);
    const contract_value_total = lots.reduce((sum, l) => sum + (l.value || 0), 0) || null;

    return {
      project_id: p.project_id,
      project_reference: p.project_reference ?? null,
      executing_agency: p.executing_agency,
      sub_agency: p.sub_agency,
      project_name: p.project_name,
      region: p.region ?? null,
      tender_board_type: p.tender_board_type ?? null,
      contract_value_total,
      contract_lots: lots,
      contractors: contractors.length > 0 ? contractors : null,
      project_end_date: p.project_end_date ?? null,
      project_status: 'DELAYED',
      completion_percent: p.completion_percent,
      has_images: p.has_images,
      last_synced_at: now,
      is_resolved: false,
      resolved_at: null,
    };
  });

  const { error: upsertError } = await supabaseAdmin
    .from('projects_oversight')
    .upsert(rows, { onConflict: 'project_id' });

  if (upsertError) {
    logger.error({ error: upsertError }, 'Oversight sync upsert failed');
    return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
  }

  // Mark projects not in this payload as resolved (no longer delayed)
  const syncedIds = rows.map((r) => r.project_id);
  const { data: resolvedRows, error: resolveError } = await supabaseAdmin
    .from('projects_oversight')
    .update({ is_resolved: true, resolved_at: now })
    .eq('is_resolved', false)
    .not('project_id', 'in', `(${syncedIds.join(',')})`)
    .select('id');

  if (resolveError) {
    logger.error({ error: resolveError }, 'Oversight resolution marking failed');
  }

  const resolvedCount = resolvedRows?.length ?? 0;
  logger.info({ synced: rows.length, resolved: resolvedCount }, 'Oversight sync completed');

  return NextResponse.json({
    success: true,
    synced: rows.length,
    resolved: resolvedCount,
    timestamp: now,
  });
}
