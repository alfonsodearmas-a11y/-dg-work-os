import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { canAccessModule } from '@/lib/modules/access';

// GET /api/applications — list with filters, agency-scoped
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  const url = req.nextUrl;
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const priority = url.searchParams.get('priority');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('pending_applications')
    .select('*, application_documents(id)', { count: 'exact' });

  // Agency scoping: DG sees all, others see only their agency
  if (session.user.role !== 'dg') {
    query = query.eq('agency', session.user.agency || '');
  }

  if (status) query = query.eq('status', status);
  if (type) query = query.eq('application_type', type);
  if (priority) query = query.eq('priority', priority);
  if (search) {
    query = query.or(`applicant_name.ilike.%${search}%,reference_number.ilike.%${search}%`);
  }

  query = query.order('submitted_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get summary stats (agency-scoped)
  let statsQuery = supabaseAdmin.from('pending_applications').select('status');
  if (session.user.role !== 'dg') {
    statsQuery = statsQuery.eq('agency', session.user.agency || '');
  }
  const { data: allApps } = await statsQuery;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const stats = {
    pending: 0,
    under_review: 0,
    approved_30d: 0,
    rejected_30d: 0,
  };

  if (allApps) {
    for (const app of allApps as { status: string; updated_at?: string }[]) {
      if (app.status === 'pending') stats.pending++;
      if (app.status === 'under_review') stats.under_review++;
    }
  }

  // Count approved/rejected in last 30 days
  let recentQuery = supabaseAdmin
    .from('pending_applications')
    .select('status')
    .in('status', ['approved', 'rejected'])
    .gte('updated_at', thirtyDaysAgo);
  if (session.user.role !== 'dg') {
    recentQuery = recentQuery.eq('agency', session.user.agency || '');
  }
  const { data: recentApps } = await recentQuery;
  if (recentApps) {
    for (const app of recentApps as { status: string }[]) {
      if (app.status === 'approved') stats.approved_30d++;
      if (app.status === 'rejected') stats.rejected_30d++;
    }
  }

  // Map docs count
  const applications = (data || []).map((app: Record<string, unknown>) => ({
    ...app,
    docs_count: Array.isArray(app.application_documents) ? app.application_documents.length : 0,
    application_documents: undefined,
  }));

  return NextResponse.json({
    applications,
    stats,
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / limit),
  });
}

// POST /api/applications — create new application
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  const body = await req.json();
  const { applicant_name, application_type, reference_number, priority, notes } = body;

  if (!applicant_name?.trim() || !application_type?.trim()) {
    return NextResponse.json({ error: 'Applicant name and application type are required' }, { status: 400 });
  }

  // Agency from user's profile (DG can specify)
  const agency = session.user.role === 'dg' ? (body.agency || session.user.agency) : session.user.agency;
  if (!agency) {
    return NextResponse.json({ error: 'Agency is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('pending_applications')
    .insert({
      agency,
      applicant_name: applicant_name.trim(),
      application_type: application_type.trim(),
      reference_number: reference_number?.trim() || null,
      priority: priority || 'normal',
      notes: notes?.trim() || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Reference number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await supabaseAdmin.from('application_activity_log').insert({
    application_id: data.id,
    action: 'created',
    new_value: 'pending',
    performed_by: session.user.id,
    details: { applicant_name, application_type },
  });

  return NextResponse.json({ application: data }, { status: 201 });
}
