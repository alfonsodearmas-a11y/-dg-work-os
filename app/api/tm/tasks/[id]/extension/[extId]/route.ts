import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { decideExtension } from '@/lib/task-queries';
import { createTaskNotification } from '@/lib/task-notifications';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const decideExtensionSchema = z.object({
  approved: z.boolean(),
  note: z.string().optional(),
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const authResult = await requireRole(['dg', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  try {
    const { id, extId } = await (ctx as { params: Promise<{ id: string; extId: string }> }).params;

    const { data, error: validationError } = await parseBody(request, decideExtensionSchema);
    if (validationError) return validationError;

    const result = await decideExtension(extId, session.user.id, data.approved, data.note);

    await createTaskNotification(
      result.requested_by,
      'extension_decided',
      id,
      `Extension ${data.approved ? 'approved' : 'rejected'}`,
      data.note || (data.approved ? 'Your deadline extension has been approved' : 'Your deadline extension was rejected')
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
