import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { extractText } from '@/lib/document-parser';
import { analyzeDocument } from '@/lib/document-analyzer';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${file.name}`;

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(filename, buffer, {
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    // 2. Create document record
    const { data: doc, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        filename,
        original_filename: file.name,
        file_path: filename,
        file_size: file.size,
        mime_type: file.type,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 3. Process asynchronously
    processDocument(doc.id, buffer, file.type, file.name).catch(console.error);

    return NextResponse.json({
      id: doc.id,
      filename: file.name,
      processing_status: 'processing'
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

async function processDocument(
  docId: string,
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
) {
  try {
    // Extract text
    const text = await extractText(buffer, mimeType);

    // Analyze with Claude
    const analysis = await analyzeDocument(text, originalFilename);

    // Create chunks for search
    const chunks = chunkText(text, 1000);
    await supabaseAdmin.from('document_chunks').insert(
      chunks.map((content, index) => ({
        document_id: docId,
        chunk_index: index,
        content
      }))
    );

    // Update document with analysis
    await supabaseAdmin
      .from('documents')
      .update({
        title: analysis.title,
        summary: analysis.summary,
        document_type: analysis.document_type,
        document_date: analysis.document_date,
        agency: analysis.agency,
        tags: analysis.tags,
        project_reference: analysis.project_reference,
        extracted_data: {
          figures: analysis.key_figures,
          dates: analysis.key_dates,
          people: analysis.key_people,
          commitments: analysis.commitments
        },
        processing_status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('id', docId);

  } catch (error) {
    console.error('Document processing failed:', error);
    await supabaseAdmin
      .from('documents')
      .update({ processing_status: 'failed' })
      .eq('id', docId);
  }
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += '\n\n' + para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
