import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getTenderById, addTenderDocument } from '@/lib/tender/queries';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);
const BUCKET = 'tender-documents';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const tender = await getTenderById(id);
    if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
      return NextResponse.json({ error: 'Cannot upload to another agency’s tender' }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 400 });
    if (file.type && !ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    const path = `${tender.agency}/${id}/${Date.now()}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: storageErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 });

    const document = await addTenderDocument({
      tenderId: id,
      fileName: file.name,
      filePath: path,
      fileType: file.type || null,
      userId: session.user.id,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    logger.error({ err, id }, 'Error uploading tender document');
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
