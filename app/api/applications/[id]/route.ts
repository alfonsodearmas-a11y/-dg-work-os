import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { canAccessModule } from '@/lib/modules/access';

// GET /api/applications/[id] — single application with documents and activity
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  const { data: app, error } = await supabaseAdmin
    .from('customer_applications')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Agency scoping
  if (session.user.role !== 'dg' && app.agency !== session.user.agency) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Fetch documents
  const { data: documents } = await supabaseAdmin
    .from('customer_application_documents')
    .select('*, users:uploaded_by(name)')
    .eq('application_id', id)
    .order('uploaded_at', { ascending: false });

  // Fetch activity log
  const { data: activity } = await supabaseAdmin
    .from('customer_application_activity_log')
    .select('*, users:performed_by(name)')
    .eq('application_id', id)
    .order('performed_at', { ascending: false });

  // Fetch creator name
  const { data: creator } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('id', app.created_by)
    .single();

  return NextResponse.json({
    application: { ...app, creator_name: creator?.name || null },
    documents: (documents || []).map((d: Record<string, unknown>) => ({
      ...d,
      uploader_name: (d.users as { name: string } | null)?.name || null,
      users: undefined,
    })),
    activity: (activity || []).map((a: Record<string, unknown>) => ({
      ...a,
      performer_name: (a.users as { name: string } | null)?.name || null,
      users: undefined,
    })),
  });
}

// PATCH /api/applications/[id] — update status/notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  // Fetch current application
  const { data: app } = await supabaseAdmin
    .from('customer_applications')
    .select('*')
    .eq('id', id)
    .single();

  if (!app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Agency scoping
  if (session.user.role !== 'dg' && app.agency !== session.user.agency) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = await req.json();
  const { status, notes, note } = body;

  const updates: Record<string, unknown> = { updated_by: session.user.id };

  if (status && status !== app.status) {
    // Enforce status transition rules
    const MINISTRY_ROLES = ['dg', 'minister', 'ps'];
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);
    const isAgencyAdmin = session.user.role === 'agency_admin';

    if (!isMinistry && !isAgencyAdmin) {
      // Officers can only move pending → under_review
      if (!(app.status === 'pending' && status === 'under_review')) {
        return NextResponse.json({
          error: 'Officers can only move applications from pending to under review',
        }, { status: 403 });
      }
    }

    // Status change requires a note
    if (!note?.trim() && !notes?.trim()) {
      return NextResponse.json({ error: 'A note is required when changing status' }, { status: 400 });
    }

    updates.status = status;

    // Log status change
    await supabaseAdmin.from('customer_application_activity_log').insert({
      application_id: id,
      action: 'status_changed',
      old_value: app.status,
      new_value: status,
      performed_by: session.user.id,
      details: { note: note?.trim() || notes?.trim() },
    });
  }

  if (notes !== undefined) {
    updates.notes = notes;
  }

  if (note?.trim() && !status) {
    // Adding a note without status change
    await supabaseAdmin.from('customer_application_activity_log').insert({
      application_id: id,
      action: 'note_added',
      new_value: note.trim(),
      performed_by: session.user.id,
    });
  }

  const { data, error } = await supabaseAdmin
    .from('customer_applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ application: data });
}
