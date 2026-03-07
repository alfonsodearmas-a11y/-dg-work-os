import { NextRequest, NextResponse } from 'next/server';
import { askDocument } from '@/lib/document-qa';
import { requireRole } from '@/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const { question } = await request.json();

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    const answer = await askDocument(id, question);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Ask document error:', error);
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    );
  }
}
