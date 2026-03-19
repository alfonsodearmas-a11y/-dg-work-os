import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

const BUCKET = 'procurement-documents';

// GET /api/procurement/[id]/documents/[docId] — download document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id, docId } = await params;

  // Fetch the document record
  const { data: doc } = await supabaseAdmin
    .from('procurement_documents')
    .select('file_name, file_path, file_type')
    .eq('id', docId)
    .eq('package_id', id)
    .single();

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Download from storage
  const { data: blob, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(doc.file_path);

  if (error || !blob) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': doc.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.file_name}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
