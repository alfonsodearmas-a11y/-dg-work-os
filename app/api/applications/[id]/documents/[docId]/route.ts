import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { canAccessModule } from '@/lib/modules/access';

// DELETE /api/applications/[id]/documents/[docId] — delete own upload
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const hasAccess = await canAccessModule(session.user.id, session.user.role, 'applications');
  if (!hasAccess) {
    return NextResponse.json({ error: "You don't have access to this module." }, { status: 403 });
  }

  // Fetch document
  const { data: doc } = await supabaseAdmin
    .from('application_documents')
    .select('*, pending_applications!inner(agency)')
    .eq('id', docId)
    .eq('application_id', id)
    .single();

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Only own uploads (or DG)
  if (session.user.role !== 'dg' && doc.uploaded_by !== session.user.id) {
    return NextResponse.json({ error: 'You can only delete your own uploads' }, { status: 403 });
  }

  // Delete from storage
  await supabaseAdmin.storage
    .from('application-documents')
    .remove([doc.file_url]);

  // Delete DB record
  const { error } = await supabaseAdmin
    .from('application_documents')
    .delete()
    .eq('id', docId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await supabaseAdmin.from('application_activity_log').insert({
    application_id: id,
    action: 'document_deleted',
    old_value: doc.file_name,
    performed_by: session.user.id,
  });

  return NextResponse.json({ success: true });
}
