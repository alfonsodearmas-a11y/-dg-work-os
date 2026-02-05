import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    console.error('Get document error:', error);
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
  try {
    const { id } = await params;

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
    console.error('Delete document error:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
