import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './db';

const anthropic = new Anthropic();

export async function askDocument(
  documentId: string,
  question: string
): Promise<string> {
  // Get document and its text
  const { data: doc } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!doc) throw new Error('Document not found');

  // Get document chunks
  const { data: chunks } = await supabaseAdmin
    .from('document_chunks')
    .select('content')
    .eq('document_id', documentId)
    .order('chunk_index');

  const fullText = chunks?.map(c => c.content).join('\n\n') || '';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Based on this document, answer the question.

DOCUMENT: ${doc.title}
TYPE: ${doc.document_type}
SUMMARY: ${doc.summary}

FULL TEXT:
${fullText.slice(0, 40000)}

QUESTION: ${question}

If the answer cannot be found in the document, say so clearly. Be concise and specific.`
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  // Save to history
  await supabaseAdmin.from('document_queries').insert({
    document_id: documentId,
    question,
    answer: content.text
  });

  return content.text;
}
