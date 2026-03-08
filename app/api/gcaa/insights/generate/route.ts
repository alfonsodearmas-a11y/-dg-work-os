import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { generateGCAAInsights } from '@/lib/gcaa-insights';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const generateInsightsSchema = z.object({
  month: z.string().min(7),
  forceRegenerate: z.boolean().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, generateInsightsSchema);
  if (error) return error;

  const normalizedMonth = data!.month.length === 7 ? `${data!.month}-01` : data!.month;
  const insights = await generateGCAAInsights(normalizedMonth, data!.forceRegenerate ?? false);

  if (!insights) {
    return NextResponse.json({ success: false, error: 'Failed to generate insights. Check API key and data availability.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: insights });
});
