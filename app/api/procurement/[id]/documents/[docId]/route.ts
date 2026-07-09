import { NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getTenderById } from '@/lib/tender/queries';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

const BUCKET = 'tender-documents';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const tender = await getTenderById(id);
  if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
  if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: doc } = await supabaseAdmin
    .from('tender_document')
    .select('file_name, file_path, file_type')
    .eq('id', docId)
    .eq('tender_id', id)
    .single();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(doc.file_path as string);
  if (error || !blob) return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': (doc.file_type as string) || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.file_name}"`,
      'Content-Length': String(buffer.length),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const tender = await getTenderById(id);
    if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { data: doc } = await supabaseAdmin
      .from('tender_document')
      .select('file_path')
      .eq('id', docId)
      .eq('tender_id', id)
      .single();
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    await supabaseAdmin.storage.from(BUCKET).remove([doc.file_path as string]).catch(() => {});
    await supabaseAdmin.from('tender_document').delete().eq('id', docId);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id, docId }, 'Error deleting tender document');
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
