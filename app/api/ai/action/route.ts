import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { executeAction } from '@/lib/ai/tools';
import { invalidateContextCache } from '@/lib/ai/context-engine';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const actionSchema = z.object({
  tool_name: z.string().min(1),
  tool_input: z.record(z.string(), z.unknown()),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await auth(); // TODO: migrate to requireRole()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await parseBody(request, actionSchema);
  if (error) return error;

  const result = await executeAction(data!.tool_name, data!.tool_input, session.user.id);

  if (result.success) {
    invalidateContextCache();
  }

  return NextResponse.json(result);
});
