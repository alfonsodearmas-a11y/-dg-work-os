import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getAllPackages, getPackagesByAgency, getPipelineStats, createPackage } from '@/lib/procurement-queries';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { METHOD_CONFIG, type ProcurementMethod } from '@/lib/procurement-types';
import { AGENCY_CODES } from '@/lib/constants/agencies';
import { logger } from '@/lib/logger';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);

    const agencyFilter = isMinistry ? undefined : session.user.agency!;

    const [packages, stats] = await Promise.all([
      agencyFilter
        ? getPackagesByAgency(agencyFilter)
        : getAllPackages(),
      getPipelineStats(agencyFilter),
    ]);

    return NextResponse.json({ packages, stats });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const msg = (err as { message?: string })?.message ?? '';

    // Table/column/relationship doesn't exist — migration not applied yet
    const isSchemaIssue =
      code === '42P01' || code === '42703' || code === 'PGRST200' || code === 'PGRST205' ||
      msg.includes('schema cache') || msg.includes('does not exist');

    if (isSchemaIssue) {
      logger.warn({ code, message: msg }, 'Procurement schema issue (migration may not be applied)');
      return NextResponse.json({ packages: [], stats: null });
    }

    logger.error({ err }, 'Error fetching procurement data');
    return NextResponse.json({ error: 'Failed to load procurement data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const { title, description, estimated_value, procurement_method, agency, expected_delivery_date, notes } = body as {
      title: string;
      description?: string;
      estimated_value: number;
      procurement_method: string;
      agency?: string;
      expected_delivery_date?: string;
      notes?: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!estimated_value || estimated_value <= 0) {
      return NextResponse.json({ error: 'Estimated value must be greater than 0' }, { status: 400 });
    }
    if (!procurement_method || !(procurement_method in METHOD_CONFIG)) {
      return NextResponse.json({ error: 'Invalid procurement method' }, { status: 400 });
    }

    // DG must provide a valid agency; agency_admin uses their own
    const packageAgency = session.user.role === 'dg' ? agency : session.user.agency;
    if (!packageAgency || !AGENCY_CODES.includes(packageAgency as typeof AGENCY_CODES[number])) {
      return NextResponse.json({ error: 'A valid agency is required' }, { status: 400 });
    }

    const pkg = await createPackage({
      title: title.trim(),
      description: description?.trim(),
      estimated_value,
      procurement_method: procurement_method as ProcurementMethod,
      agency: packageAgency,
      submitted_by: session.user.id,
      expected_delivery_date: expected_delivery_date || undefined,
      notes: notes?.trim() || undefined,
    });

    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err: unknown) {
    logger.error({ err }, 'Error creating procurement package');
    return NextResponse.json({ error: 'Failed to create tender' }, { status: 500 });
  }
}
