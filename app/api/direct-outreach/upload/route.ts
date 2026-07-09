import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { OutreachImportError, importOutreachWorkbook } from '@/lib/direct-outreach/import-xlsx';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel's serverless request-body cap is ~4.5 MB — a larger advertised limit
// would die as an opaque platform 413 before this handler ever runs.
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 4 MB limit' }, { status: 400 });
    }
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (ext !== '.xlsx') {
      return NextResponse.json({ error: 'Only .xlsx files are allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importOutreachWorkbook(buffer);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    if (err instanceof OutreachImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error({ err }, '[direct-outreach] workbook upload failed');
    return NextResponse.json({ error: 'Failed to process the workbook' }, { status: 500 });
  }
}
