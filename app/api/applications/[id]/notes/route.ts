import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { canAccessModule } from '@/lib/modules/role-modules';


// GET /api/applications/[id]/notes — all notes for an application
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = canAccessModule(session.user.role, session.user.agency, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  // Verify application exists and user has access
  const { data: app } = await supabaseAdmin
    .from('customer_applications')
    .select('id, agency')
    .eq('id', id)
    .single();

  if (!app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  if (session.user.role !== 'superadmin' && app.agency !== session.user.agency) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: notes, error } = await supabaseAdmin
    .from('customer_application_notes')
    .select('*, users:created_by(name)')
    .eq('application_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notes: (notes || []).map((n: Record<string, unknown>) => ({
      ...n,
      author_name: (n.users as { name: string } | null)?.name || null,
      users: undefined,
    })),
  });
}

// POST /api/applications/[id]/notes — create a new note with optional status change
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = canAccessModule(session.user.role, session.user.agency, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  // Verify application exists and user has access
  const { data: app } = await supabaseAdmin
    .from('customer_applications')
    .select('id, agency, status')
    .eq('id', id)
    .single();

  if (!app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  if (session.user.role !== 'superadmin' && app.agency !== session.user.agency) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = await req.json();
  const { note_text, new_status } = body;

  if (!note_text?.trim()) {
    return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
  }

  const statusChanged = new_status && new_status !== app.status;

  // Enforce role-based status transition rules
  if (statusChanged) {
    const isMinistry = (session.user.role) === 'superadmin';
    const isAgencyAdmin = session.user.role === 'agency_manager';

    if (!isMinistry && !isAgencyAdmin) {
      if (!(app.status === 'pending' && new_status === 'under_review')) {
        return NextResponse.json({
          error: 'Officers can only move applications from pending to under review',
        }, { status: 403 });
      }
    }
  }

  // Create the note
  const { data: note, error } = await supabaseAdmin
    .from('customer_application_notes')
    .insert({
      application_id: id,
      note_text: note_text.trim(),
      status_at_time: app.status,
      new_status: statusChanged ? new_status : null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If status changed, update the application and log activity
  if (statusChanged) {
    const { error: statusErr } = await supabaseAdmin
      .from('customer_applications')
      .update({ status: new_status, updated_by: session.user.id })
      .eq('id', id);

    if (statusErr) {
      return NextResponse.json({ error: 'Note saved but status update failed' }, { status: 500 });
    }

    await supabaseAdmin.from('customer_application_activity_log').insert({
      application_id: id,
      action: 'status_changed',
      old_value: app.status,
      new_value: new_status,
      performed_by: session.user.id,
      details: { note: note_text.trim(), from_note: true },
    });
  }

  // Log note_added activity + fetch author name in parallel
  const [, { data: author }] = await Promise.all([
    supabaseAdmin.from('customer_application_activity_log').insert({
      application_id: id,
      action: 'note_added',
      new_value: note_text.trim(),
      performed_by: session.user.id,
      details: { from_note: true, note_id: note.id },
    }),
    supabaseAdmin
      .from('users')
      .select('name')
      .eq('id', session.user.id)
      .single(),
  ]);

  return NextResponse.json({
    note: { ...note, author_name: author?.name || null },
  }, { status: 201 });
}
