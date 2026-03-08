import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { askDocument } from '@/lib/document-qa';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const askSchema = z.object({
  question: z.string().min(1),
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error } = await parseBody(request, askSchema);
  if (error) return error;

  const answer = await askDocument(id, data!.question);

  return NextResponse.json({ answer });
});
