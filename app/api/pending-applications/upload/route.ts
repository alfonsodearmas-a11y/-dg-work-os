import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { createHash, randomBytes } from 'crypto';
import { detectAgency } from '@/lib/pending-applications-parser';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'pending-uploads';

/**
 * Validate upload authorization. Returns the locked agency (for upload-auth portal)
 * or null (for authenticated users with DG/minister/ps role, meaning any agency is allowed).
 * Throws an object with { status, error } if unauthorized.
 */
async function validateAuth(request: NextRequest): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    const role = session.user.role;
    if (['dg', 'minister', 'ps'].includes(role)) return null;
    if (session.user.agency) return session.user.agency.toUpperCase();
    throw { status: 403, error: 'Your account does not have upload access' };
  }

  const uploadAuth = request.cookies.get('upload-auth')?.value;
  const uploadAgency = request.cookies.get('upload-agency')?.value;

  if (!uploadAuth || !uploadAgency) {
    throw { status: 401, error: 'Authentication required' };
  }

  const agency = uploadAgency.toUpperCase();
  if (agency !== 'GPL' && agency !== 'GWI') {
    throw { status: 401, error: 'Invalid agency' };
  }

  const code = process.env[`UPLOAD_ACCESS_CODE_${agency}`];
  if (!code) {
    throw { status: 401, error: 'Upload access not configured' };
  }

  const expected = createHash('sha256').update(code + '_upload_' + agency).digest('hex');
  if (uploadAuth !== expected) {
    throw { status: 401, error: 'Invalid or expired session' };
  }

  return agency;
}

async function ensureBucket() {
  await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).catch(() => {
    // Bucket already exists — safe to ignore
  });
}

/**
 * Phase 1: Accept file upload, validate, detect agency, store in Supabase Storage.
 * Returns fileId + storagePath for the client to trigger processing via /api/pending-applications/process.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  let lockedAgency: string | null;
  try {
    lockedAgency = await validateAuth(request);
  } catch (authError: unknown) {
    const err = authError as { status: number; error: string };
    return NextResponse.json({ error: err.error }, { status: err.status });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  let agencyHint = formData.get('agency') as string | null;

  if (lockedAgency) {
    agencyHint = lockedAgency;
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Invalid file type. Only .xls and .xlsx files are accepted.' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Auto-detect or use hint
  let agency = agencyHint?.toUpperCase() as 'GPL' | 'GWI' | undefined;
  if (!agency || (agency !== 'GPL' && agency !== 'GWI')) {
    const detected = detectAgency(buffer);
    if (!detected) {
      return NextResponse.json({ error: 'Could not auto-detect agency. Please specify GPL or GWI.' }, { status: 400 });
    }
    agency = detected;
  }

  // Store file in Supabase Storage for processing in a separate request
  await ensureBucket();
  const fileId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const storagePath = `${fileId}/${file.name}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });

  if (uploadError) {
    logger.error({ err: uploadError }, 'Failed to store upload file in Supabase Storage');
    return NextResponse.json({ error: 'Failed to store file. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    fileId,
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    agency,
  });
});
