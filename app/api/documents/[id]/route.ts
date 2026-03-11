import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_DETAIL_COLUMNS = 'id, filename, original_filename, file_path, title, summary, document_type, agency, tags, file_size, mime_type, processing_status, key_entities, analysis, uploaded_at, created_at';
const DOC_QUERY_COLUMNS = 'id, document_id, question, answer, created_at';

function validateId(id: string): NextResponse | null {
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid document ID format' }, { status: 400 });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const idError = validateId(id);
  if (idError) return idError;

  try {
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select(DOC_DETAIL_COLUMNS)
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get Q&A history
    const { data: queries } = await supabaseAdmin
      .from('document_queries')
      .select(DOC_QUERY_COLUMNS)
      .eq('document_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ...doc,
      queries: queries || []
    });
  } catch (error) {
    logger.error({ err: error, documentId: id }, 'Failed to fetch document');
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const idError = validateId(id);
  if (idError) return idError;

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Only allow specific fields to be updated
    if (body.doc_type !== undefined) {
      const validTypes = ['report', 'memo', 'letter', 'policy', 'budget', 'contract', 'meeting_notes', 'invoice', 'other'];
      if (!validTypes.includes(body.doc_type)) {
        return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
      }
      updates.document_type = body.doc_type;
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json({ error: 'Tags must be an array' }, { status: 400 });
      }
      // Validate each tag is a non-empty string with reasonable length
      const MAX_TAG_LENGTH = 100;
      const MAX_TAGS = 50;
      if (body.tags.length > MAX_TAGS) {
        return NextResponse.json({ error: `Too many tags (max ${MAX_TAGS})` }, { status: 400 });
      }
      for (const tag of body.tags) {
        if (typeof tag !== 'string' || tag.trim().length === 0 || tag.length > MAX_TAG_LENGTH) {
          return NextResponse.json(
            { error: `Each tag must be a non-empty string (max ${MAX_TAG_LENGTH} characters)` },
            { status: 400 }
          );
        }
      }
      updates.tags = body.tags.map((t: string) => t.trim());
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Verify the document exists before updating
    const { data: existing } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('documents')
      .update(updates)
      .eq('id', id)
      .select(DOC_DETAIL_COLUMNS)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error, documentId: id }, 'Failed to update document');
    return NextResponse.json(
      { error: 'Failed to update document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const idError = validateId(id);
  if (idError) return idError;

  try {
    // Get document to find storage path
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.file_path) {
      // Delete from storage
      await supabaseAdmin.storage
        .from('documents')
        .remove([doc.file_path]);
    }

    // Delete from database (cascades to chunks and queries)
    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error, documentId: id }, 'Failed to delete document');
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
