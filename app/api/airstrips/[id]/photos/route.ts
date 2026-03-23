import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PHOTO_TYPES } from '@/lib/airstrip-types';
import type { PhotoType } from '@/lib/airstrip-types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'airstrip-photos';

// POST /api/airstrips/[id]/photos — upload photo(s)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const { id } = await params;
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const photoType = (formData.get('photo_type') as string) || 'general';
    const caption = formData.get('caption') as string | null;
    const takenAt = formData.get('taken_at') as string | null;
    const maintenanceLogId = formData.get('maintenance_log_id') as string | null;

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    if (!PHOTO_TYPES.includes(photoType as PhotoType)) {
      return NextResponse.json({ error: 'Invalid photo type' }, { status: 400 });
    }

    const uploaded = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Invalid file type: ${file.name}. Only JPG, PNG, WebP are allowed.` }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name}. Max 10MB.` }, { status: 400 });
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${id}/${photoType}/${timestamp}_${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: file.type, upsert: false });

      if (uploadError) {
        logger.error({ err: uploadError }, `Photo upload error: ${file.name}`);
        continue;
      }

      const { data: record, error: dbError } = await supabaseAdmin
        .from('airstrip_photos')
        .insert({
          airstrip_id: id,
          maintenance_log_id: maintenanceLogId || null,
          storage_path: storagePath,
          file_name: file.name,
          caption: caption?.trim() || null,
          photo_type: photoType,
          taken_at: takenAt || null,
          uploaded_by: session.user.id,
        })
        .select()
        .single();

      if (dbError) {
        logger.error({ err: dbError }, `Photo DB record error: ${file.name}`);
        continue;
      }

      uploaded.push(record);
    }

    return NextResponse.json({ photos: uploaded }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip photo upload error');
    return NextResponse.json({ error: 'Failed to upload photos' }, { status: 500 });
  }
}

// DELETE /api/airstrips/[id]/photos — delete a photo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const { photo_id } = await request.json();

    if (!photo_id) {
      return NextResponse.json({ error: 'photo_id is required' }, { status: 400 });
    }

    // Get storage path before deleting
    const { data: photo, error: fetchError } = await supabaseAdmin
      .from('airstrip_photos')
      .select('storage_path')
      .eq('id', photo_id)
      .eq('airstrip_id', id)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Delete from storage and DB in parallel
    const [storageRes, dbRes] = await Promise.all([
      supabaseAdmin.storage.from(BUCKET).remove([photo.storage_path]),
      supabaseAdmin.from('airstrip_photos').delete().eq('id', photo_id),
    ]);

    if (storageRes.error) logger.warn({ err: storageRes.error }, 'Photo storage delete warning');
    if (dbRes.error) throw dbRes.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip photo delete error');
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
  }
}
