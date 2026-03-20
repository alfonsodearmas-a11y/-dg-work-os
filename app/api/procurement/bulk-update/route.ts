import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';
import { PROCUREMENT_STAGES } from '@/lib/procurement-types';
import { deletePackage } from '@/lib/procurement-queries';

// ── PATCH: Bulk update stage / agency ────────────────────────────────────────

const bulkPatchSchema = z.object({
  packageIds: z.array(z.string().min(1)).min(1),
  updates: z.object({
    current_stage: z.enum(PROCUREMENT_STAGES as unknown as [string, ...string[]]).optional(),
    agency: z.string().nullable().optional(),
  }),
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { data, error: validationError } = await parseBody(request, bulkPatchSchema);
  if (validationError) return validationError;

  // Agency admins can only update their own agency's packages
  if (session.user.role !== 'dg') {
    const { data: pkgs } = await supabaseAdmin
      .from('procurement_packages')
      .select('id, agency')
      .in('id', data.packageIds);

    const foreign = pkgs?.find(
      (p) => (p.agency as string).toLowerCase() !== session.user.agency?.toLowerCase(),
    );
    if (foreign) {
      return apiError('FORBIDDEN', 'Cannot update tenders from another agency', 403);
    }
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.updates.current_stage !== undefined) {
    updatePayload.current_stage = data.updates.current_stage;
  }
  if (data.updates.agency !== undefined) {
    updatePayload.agency = data.updates.agency;
  }

  const { error } = await supabaseAdmin
    .from('procurement_packages')
    .update(updatePayload)
    .in('id', data.packageIds);

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  // Log stage history if stage changed
  if (data.updates.current_stage) {
    const historyRows = data.packageIds.map((id) => ({
      package_id: id,
      from_stage: null,
      to_stage: data.updates.current_stage,
      changed_by: session.user.id,
      notes: 'Bulk stage change',
    }));

    await supabaseAdmin
      .from('procurement_stage_history')
      .insert(historyRows);
  }

  return NextResponse.json({ success: true });
});

// ── DELETE: Bulk delete packages ─────────────────────────────────────────────

const bulkDeleteSchema = z.object({
  packageIds: z.array(z.string().min(1)).min(1).max(100),
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { data, error: validationError } = await parseBody(request, bulkDeleteSchema);
  if (validationError) return validationError;

  // Agency admins can only delete their own agency's packages
  if (session.user.role !== 'dg') {
    const { data: pkgs } = await supabaseAdmin
      .from('procurement_packages')
      .select('id, agency')
      .in('id', data.packageIds);

    const foreign = pkgs?.find(
      (p) => (p.agency as string).toLowerCase() !== session.user.agency?.toLowerCase(),
    );
    if (foreign) {
      return apiError('FORBIDDEN', 'Cannot delete tenders from another agency', 403);
    }
  }

  // Delete one-by-one to cascade properly (stage_history, notes, documents, storage)
  const errors: string[] = [];
  for (const id of data.packageIds) {
    try {
      await deletePackage(id);
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (errors.length > 0) {
    return apiError('PARTIAL_FAILURE', `${data.packageIds.length - errors.length} deleted, ${errors.length} failed`, 500);
  }

  return NextResponse.json({ success: true, deleted: data.packageIds.length });
});
