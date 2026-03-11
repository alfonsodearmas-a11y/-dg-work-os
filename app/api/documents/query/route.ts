import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { sanitizeSearchInput } from '@/lib/parse-utils';

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { question } = await request.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Search for relevant documents by title/summary match
    const searchTerms = sanitizeSearchInput(question)
      .split(/\s+/)
      .filter((t: string) => t.length > 2)
      .slice(0, 5);

    // Get documents matching any search term
    const orClauses = searchTerms
      .map((term: string) => `title.ilike.%${term}%,summary.ilike.%${term}%`)
      .join(',');

    const { data: docs } = await supabaseAdmin
      .from('documents')
      .select('id, title, summary, document_type, agency')
      .eq('processing_status', 'completed')
      .or(orClauses || 'id.neq.00000000-0000-0000-0000-000000000000')
      .order('uploaded_at', { ascending: false })
      .limit(10);

    if (!docs || docs.length === 0) {
      return NextResponse.json({
        answer: 'No relevant documents found. Try uploading documents first or refining your query.',
        sources: [],
      });
    }

    // Get chunks for each relevant document (limited context)
    const documentContexts: string[] = [];
    const sources: Array<{ id: string; title: string; agency: string | null }> = [];

    for (const doc of docs.slice(0, 5)) {
      const { data: chunks } = await supabaseAdmin
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id)
        .order('chunk_index')
        .limit(5);

      const text = chunks?.map(c => c.content).join('\n') || '';
      if (text) {
        documentContexts.push(
          `--- DOCUMENT: ${doc.title} (${doc.document_type || 'unknown type'}, Agency: ${doc.agency || 'General'}) ---\nSUMMARY: ${doc.summary || 'No summary'}\nCONTENT:\n${text.slice(0, 8000)}`
        );
        sources.push({ id: doc.id, title: doc.title, agency: doc.agency });
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `You are an executive intelligence assistant for the Ministry of Public Utilities and Aviation (Guyana). Answer the question using ONLY the provided document context. If the answer isn't in the documents, say so clearly.

Format your response with markdown: use headers, bullet points, bold text, and tables where appropriate.

DOCUMENTS:
${documentContexts.join('\n\n')}

QUESTION: ${question}

Cite which document(s) your answer draws from.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    return NextResponse.json({
      answer: content.text,
      sources,
    });
  } catch (error) {
    logger.error({ err: error }, 'Cross-document query failed');
    return NextResponse.json(
      { error: 'Failed to process query' },
      { status: 500 }
    );
  }
}
