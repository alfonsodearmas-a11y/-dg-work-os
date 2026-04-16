import { NextResponse, NextRequest } from 'next/server';
import { requirePsipSyncAccess } from '@/lib/auth-helpers';
import { computePsipDiffFromXlsx } from '@/lib/procurement-psip-sync';
import { logger } from '@/lib/logger';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

export async function POST(request: NextRequest) {
  const auth = await requirePsipSyncAccess();
  if ('error' in auth) return auth.error;

  let file: File;
  try {
    const form = await request.formData();
    const entry = form.get('file');
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded (expected multipart field "file")' }, { status: 400 });
    }
    file = entry;
  } catch {
    return NextResponse.json({ error: 'Could not read uploaded form data' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Uploaded file exceeds 20 MB' }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type) && !/\.xlsx?$/i.test(file.name)) {
    return NextResponse.json({ error: 'Invalid file type. Upload a .xlsx or .xls file.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const diff = await computePsipDiffFromXlsx(buffer);
    return NextResponse.json({ diff, file_name: file.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not parse uploaded file';
    logger.error({ err, fileName: file.name }, 'procurement-psip-upload: parse failed');
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
