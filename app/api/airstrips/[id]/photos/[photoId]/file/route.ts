import { NextRequest, NextResponse } from 'next/server';
import { requireAirstripAccess } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const BUCKET = 'airstrip-photos';

// GET /api/airstrips/[id]/photos/[photoId]/file — auth-gated photo stream.
//
// Mirrors the documents/procurement download pattern: access is re-checked on
// every request (requireAirstripAccess) and the object is streamed via the
// service role. The bucket is private and no public or signed URL is ever
// minted — a user who cannot read the airstrip cannot read its photos.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const authResult = await requireAirstripAccess();
  if (authResult instanceof NextResponse) return authResult;

  const { id, photoId } = await params;

  const { data: photo, error: photoErr } = await supabaseAdmin
    .from('airstrip_photos')
    .select('storage_path, file_name')
    .eq('id', photoId)
    .eq('airstrip_id', id)
    .single();
  if (photoErr || !photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const { data: blob, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(photo.storage_path as string);
  if (error || !blob) {
    logger.error({ err: error, photoId }, 'Airstrip photo download failed');
    return NextResponse.json({ error: 'Failed to load photo' }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${(photo.file_name as string) || 'photo'}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
