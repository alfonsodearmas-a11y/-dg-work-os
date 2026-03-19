import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getAllPackages, getPackagesByAgency, getPipelineStats, createPackage } from '@/lib/procurement-queries';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { METHOD_CONFIG, type ProcurementMethod } from '@/lib/procurement-types';

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
    // Table doesn't exist yet (migration not applied) — return empty data gracefully
    const code = (err as { code?: string })?.code;
    const msg = (err as { message?: string })?.message ?? '';
    if (code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist')) {
      console.warn('Procurement tables not found — migration 052 likely not applied yet');
      return NextResponse.json({ packages: [], stats: null });
    }
    console.error('Error fetching procurement data:', err);
    return NextResponse.json({ error: 'Failed to load procurement data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireRole(['agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const { title, description, estimated_value, procurement_method } = body as {
      title: string;
      description?: string;
      estimated_value: number;
      procurement_method: string;
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

    const pkg = await createPackage({
      title: title.trim(),
      description: description?.trim(),
      estimated_value,
      procurement_method: procurement_method as ProcurementMethod,
      agency: session.user.agency!,
      submitted_by: session.user.id,
    });

    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    console.error('Error creating procurement package:', err);
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 });
  }
}
