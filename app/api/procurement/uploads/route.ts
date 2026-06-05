import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { previewPsipUpload, applyPsipUpload, cancelPsipUpload } from '@/lib/psip/ingest';
import { logger } from '@/lib/logger';

const UPLOAD_BUCKET = 'psip-uploads';
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/procurement/uploads — list recent uploads
 */
export async function GET() {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  try {
    const { data, error } = await supabaseAdmin
      .from('upload')
      .select('id, filename, uploaded_at, uploaded_by, status, stats, applied_at, cancelled_at, uploader:users!upload_uploaded_by_fkey(name)')
      .order('uploaded_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ uploads: data || [] });
  } catch (err) {
    logger.error({ err }, 'Error listing uploads');
    return NextResponse.json({ error: 'Failed to list uploads' }, { status: 500 });
  }
}

/**
 * POST /api/procurement/uploads — preview or apply an upload.
 * multipart/form-data when previewing: { file }
 * application/json when applying: { upload_id, action: 'apply' | 'cancel' }
 */
export async function POST(request: NextRequest) {
  const result = await requireRole(['superadmin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.startsWith('multipart/form-data')) {
      // PREVIEW
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB` }, { status: 400 });

      // Store raw xlsx in Supabase Storage (preview or applied, we keep the file).
      const storagePath = `${Date.now()}_${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: storageErr } = await supabaseAdmin.storage.from(UPLOAD_BUCKET).upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      // Storage is best-effort: if the bucket doesn't exist we still proceed with in-memory preview.
      if (storageErr) {
        logger.warn({ err: storageErr }, 'PSIP upload: storage save failed (bucket may not exist)');
      }

      const outcome = await previewPsipUpload(buffer, {
        uploadedBy: session.user.id,
        filename: file.name,
        storagePath: storageErr ? '' : storagePath,
      });
      return NextResponse.json(outcome, { status: 201 });
    }

    const body = await request.json();
    const uploadId = body?.upload_id as string | undefined;
    const action = body?.action as 'apply' | 'cancel' | undefined;
    if (!uploadId || !action) return NextResponse.json({ error: 'upload_id and action are required' }, { status: 400 });

    // Load upload + its stored file.
    const { data: uploadRow, error: getErr } = await supabaseAdmin
      .from('upload')
      .select('id, storage_path, status')
      .eq('id', uploadId)
      .single();
    if (getErr || !uploadRow) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    if (uploadRow.status !== 'preview') return NextResponse.json({ error: `Upload is ${uploadRow.status}, cannot ${action}` }, { status: 409 });

    if (action === 'cancel') {
      await cancelPsipUpload(uploadId);
      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // APPLY: re-read the xlsx from storage and re-ingest.
    if (!uploadRow.storage_path) {
      return NextResponse.json({ error: 'This upload has no stored file; re-upload to apply.' }, { status: 409 });
    }
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(UPLOAD_BUCKET).download(uploadRow.storage_path as string);
    if (dlErr || !blob) return NextResponse.json({ error: 'Failed to fetch upload file for apply' }, { status: 500 });
    const buffer = Buffer.from(await blob.arrayBuffer());
    const applyStats = await applyPsipUpload(uploadId, buffer, session.user.id);
    return NextResponse.json({ success: true, status: 'applied', stats: applyStats });
  } catch (err) {
    logger.error({ err }, 'PSIP upload: error');
    return NextResponse.json({ error: (err as Error).message || 'Upload failed' }, { status: 500 });
  }
}
