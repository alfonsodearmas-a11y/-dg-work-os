import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select('*')
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
      .select('*')
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get document to find storage path
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .select('file_path')
      .eq('id', id)
      .single();

    if (doc?.file_path) {
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
