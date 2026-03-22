import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { getPackageSummary, uploadDocument } from '@/lib/procurement-queries';
import { logger } from '@/lib/logger';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'procurement-documents';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  try {
    // Lightweight check: verify package exists and belongs to user's agency
    const pkg = await getPackageSummary(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }

    if (session.user.role !== 'dg' && pkg.agency.toLowerCase() !== session.user.agency?.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot upload documents to another agency\'s tender' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF, DOCX, XLSX, JPEG, and PNG files are allowed' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 });
    }

    // Upload to Supabase Storage (bucket created via Supabase dashboard/migration)
    const storagePath = `${pkg.agency}/${id}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Create DB record via procurement-queries
    const document = await uploadDocument({
      packageId: id,
      fileName: file.name,
      filePath: storagePath,
      fileType: file.type,
      userId: session.user.id,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'procurement-documents: error uploading document');
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
