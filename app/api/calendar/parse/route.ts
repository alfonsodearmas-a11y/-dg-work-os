import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { parseNaturalLanguageEvent } from '@/lib/calendar-nlp';
import { logger } from '@/lib/logger';

const parseEventSchema = z.object({
  input: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, parseEventSchema);
  if (error) return error;

  try {
    const parsed = await parseNaturalLanguageEvent(data.input.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    logger.error({ err }, 'Failed to parse event');
    return apiError('PARSE_FAILED', 'Failed to parse event description', 500);
  }
}
