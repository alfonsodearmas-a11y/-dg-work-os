import { NextRequest, NextResponse } from 'next/server';
import { askDocument } from '@/lib/document-qa';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
