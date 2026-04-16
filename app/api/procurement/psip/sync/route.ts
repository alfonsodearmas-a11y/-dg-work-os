import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePsipSyncAccess } from '@/lib/auth-helpers';
import { parseBody } from '@/lib/api-utils';
import { applyChanges, type RecordDiff } from '@/lib/procurement-psip-sync';
import { PROCUREMENT_STAGES } from '@/lib/procurement-types';
import { logger } from '@/lib/logger';

const stageSchema = z.enum(PROCUREMENT_STAGES as unknown as [string, ...string[]]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const fieldChangeSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('current_stage'), before: stageSchema.nullable(), after: stageSchema.nullable() }),
  ...(['date_first_advertised', 'tender_closing_date', 'date_eval_submitted_mtb', 'date_eval_submitted_nptab', 'date_of_award'] as const).map(
    (f) => z.object({ field: z.literal(f), before: dateSchema.nullable(), after: dateSchema.nullable() }),
  ),
  z.object({ field: z.literal('psip_remarks'), before: z.string().nullable(), after: z.string().nullable() }),
]);

const recordDiffSchema = z.object({
  package_id: z.string().uuid(),
  psip_ref: z.string(),
  title: z.string(),
  changes: z.array(fieldChangeSchema),
  unmapped_status: z.string().optional(),
});

const applySchema = z.object({
  approvedChanges: z.array(recordDiffSchema).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requirePsipSyncAccess();
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { data, error } = await parseBody(request, applySchema);
  if (error) return error;

  try {
    const result = await applyChanges(data.approvedChanges as RecordDiff[], session.user.id);
    return NextResponse.json({
      applied_count: result.applied.length,
      applied: result.applied,
      failed: result.failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'procurement-psip-sync: apply failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
