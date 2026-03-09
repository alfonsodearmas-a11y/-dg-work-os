import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

  try {
    const formData = await request.formData();
    const file = formData.get('audio') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${id}/${file.name}`;

    // NOTE: The "meetings-audio" bucket must exist in Supabase Storage.
    // Create it manually via the Supabase dashboard if it doesn't exist.
    const { error: uploadError } = await supabaseAdmin.storage
      .from('meetings-audio')
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      throw uploadError;
    }

    const { error: updateError } = await supabaseAdmin
      .from('meetings')
      .update({
        audio_path: storagePath,
        status: 'UPLOADED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ audioPath: storagePath });
  } catch (err) {
    logger.error({ err, meetingId: id }, 'Meeting audio upload failed');
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
