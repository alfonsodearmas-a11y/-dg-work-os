import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { canAccessModule } from '@/lib/modules/access';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/applications/[id]/documents — upload file
export async function POST(
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

  // Verify application exists and user has agency access
  const { data: app } = await supabaseAdmin
    .from('pending_applications')
    .select('id, agency')
    .eq('id', id)
    .single();

  if (!app) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  if (session.user.role !== 'dg' && app.agency !== session.user.agency) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF, DOCX, and XLSX files are allowed' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 });
  }

  // Upload to Supabase Storage
  const storagePath = `${app.agency}/${id}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from('application-documents')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create DB record
  const { data: doc, error: dbError } = await supabaseAdmin
    .from('application_documents')
    .insert({
      application_id: id,
      file_name: file.name,
      file_url: storagePath,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: session.user.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Log activity
  await supabaseAdmin.from('application_activity_log').insert({
    application_id: id,
    action: 'document_uploaded',
    new_value: file.name,
    performed_by: session.user.id,
    details: { file_name: file.name, file_size: file.size, file_type: file.type },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
