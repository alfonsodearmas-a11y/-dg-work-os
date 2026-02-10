import { NextRequest, NextResponse } from 'next/server';
import { getDocumentContent } from '@/lib/budget-db';

export async function GET(request: NextRequest) {
  const agency = request.nextUrl.searchParams.get('agency');
  const doc = request.nextUrl.searchParams.get('doc');

  if (!agency || !doc) {
    return NextResponse.json({ error: 'agency and doc params required' }, { status: 400 });
  }

  try {
    const rows = getDocumentContent(agency, doc);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const sections = rows.map(r => ({
      id: r.id,
      page_number: r.page_number,
      text_content: r.text_content,
    }));

    return NextResponse.json({
      document_name: doc,
      agency,
      chunk_count: sections.length,
      sections,
      full_text: sections.map(s => s.text_content).join('\n\n---\n\n'),
    });
  } catch (error) {
    console.error('Document error:', error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
}
