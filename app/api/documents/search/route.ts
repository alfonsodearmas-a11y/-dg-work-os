import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/document-search';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const agency = searchParams.get('agency') || undefined;
    const type = searchParams.get('type') || undefined;
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;

    const results = await searchDocuments(query, {
      agency,
      document_type: type,
      date_from: dateFrom,
      date_to: dateTo
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
