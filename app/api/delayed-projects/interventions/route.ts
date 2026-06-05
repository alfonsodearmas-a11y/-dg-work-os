import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody } from '@/lib/api-utils';
import { getInterventions, createIntervention, getInterventionSummary } from '@/lib/delayed-projects/queries';
import type { InterventionFilters, InterventionType, InterventionStatus } from '@/lib/delayed-projects/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;

  const sp = request.nextUrl.searchParams;

  // If requesting summary
  if (sp.get('summary') === 'true') {
    const summary = await getInterventionSummary();
    return NextResponse.json(summary);
  }

  const filters: InterventionFilters = {
    project_id: sp.get('project_id') || undefined,
    status: sp.get('status')?.split(',').filter(Boolean) as InterventionStatus[] | undefined,
    intervention_type: sp.get('intervention_type')?.split(',').filter(Boolean) as InterventionType[] | undefined,
    page: sp.get('page') ? Number(sp.get('page')) : 1,
    limit: sp.get('limit') ? Number(sp.get('limit')) : 50,
  };

  const result = await getInterventions(filters);
  return NextResponse.json(result);
}

const CreateSchema = z.object({
  project_id: z.string().uuid(),
  intervention_type: z.enum([
    'SITE_VISIT', 'CONTRACTOR_MEETING', 'ESCALATION_TO_PS',
    'BOND_WARNING', 'TERMINATION_NOTICE', 'TIMELINE_EXTENSION',
    'VARIATION_ORDER', 'OTHER',
  ]),
  description: z.string().min(1),
  assigned_to: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const parsed = await parseBody(request, CreateSchema);
  if (parsed.error) return parsed.error;

  const intervention = await createIntervention({
    ...parsed.data,
    created_by: session.user.name || session.user.email || 'Unknown',
  });

  return NextResponse.json(intervention, { status: 201 });
}
