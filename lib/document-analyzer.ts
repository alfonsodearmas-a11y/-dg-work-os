import Anthropic from '@anthropic-ai/sdk';
import { parseAIJson } from '@/lib/parse-utils';

const anthropic = new Anthropic();

export interface DocumentAnalysis {
  title: string;
  summary: string;
  document_type: string;
  document_date: string | null;
  agency: string | null;
  key_figures: Array<{ label: string; value: string; context: string }>;
  key_dates: Array<{ label: string; date: string; context: string }>;
  key_people: Array<{ name: string; role: string; organization: string }>;
  commitments: Array<{ description: string; deadline: string; responsible: string }>;
  tags: string[];
  project_reference: string | null;
}

export async function analyzeDocument(
  text: string,
  filename: string
): Promise<DocumentAnalysis> {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `Analyze this document and extract structured information.

DOCUMENT FILENAME: ${filename}

DOCUMENT TEXT:
${text.slice(0, 50000)} ${text.length > 50000 ? '... [truncated]' : ''}

Please provide a JSON response with:
{
  "title": "Inferred document title",
  "summary": "2-3 sentence executive summary",
  "document_type": "contract|report|letter|memo|budget|policy|meeting_notes|invoice|other",
  "document_date": "YYYY-MM-DD if mentioned, null otherwise",
  "agency": "GPL|GWI|HECI|MARAD|GCAA|CJIA|null if not specific to one agency",
  "key_figures": [
    {"label": "Total Budget", "value": "$50,000,000", "context": "2026 allocation"}
  ],
  "key_dates": [
    {"label": "Deadline", "date": "2026-03-15", "context": "Submission deadline"}
  ],
  "key_people": [
    {"name": "John Smith", "role": "Project Manager", "organization": "GPL"}
  ],
  "commitments": [
    {"description": "Deliver final report", "deadline": "2026-03-01", "responsible": "MARAD"}
  ],
  "tags": ["infrastructure", "water", "capital project"],
  "project_reference": "GPLXXX202601X27254 if this appears to be about a specific project, null otherwise"
}

Return ONLY valid JSON, no markdown formatting.`
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  return parseAIJson<DocumentAnalysis>(content.text);
}

/**
 * Re-analyze a document that failed or needs updated analysis.
 * Fetches text from chunks, runs analysis, and updates the document record.
 */
export async function reanalyzeDocument(documentId: string): Promise<DocumentAnalysis> {
  const { supabaseAdmin } = await import('./db');

  // Get document metadata
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .select('original_filename, file_path, mime_type')
    .eq('id', documentId)
    .single();

  if (docError || !doc) throw new Error('Document not found');

  // Get text from chunks
  const { data: chunks } = await supabaseAdmin
    .from('document_chunks')
    .select('content')
    .eq('document_id', documentId)
    .order('chunk_index');

  let text = chunks?.map(c => c.content).join('\n\n') || '';

  // If no chunks, re-extract from storage
  if (!text) {
    const { data: fileData, error: dlError } = await supabaseAdmin.storage
      .from('documents')
      .download(doc.file_path);

    if (dlError || !fileData) throw new Error('Failed to download file from storage');

    const { extractText } = await import('./document-parser');
    const buffer = Buffer.from(await fileData.arrayBuffer());
    text = await extractText(buffer, doc.mime_type);

    // Re-create chunks
    const chunkSize = 1000;
    const paragraphs = text.split(/\n\n+/);
    const newChunks: string[] = [];
    let current = '';
    for (const para of paragraphs) {
      if ((current + para).length > chunkSize && current) {
        newChunks.push(current.trim());
        current = para;
      } else {
        current += '\n\n' + para;
      }
    }
    if (current.trim()) newChunks.push(current.trim());

    // Delete old chunks (if any) and insert new
    await supabaseAdmin.from('document_chunks').delete().eq('document_id', documentId);
    if (newChunks.length > 0) {
      await supabaseAdmin.from('document_chunks').insert(
        newChunks.map((content, index) => ({
          document_id: documentId,
          chunk_index: index,
          content,
        }))
      );
    }
  }

  // Mark as processing
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'processing' })
    .eq('id', documentId);

  try {
    const analysis = await analyzeDocument(text, doc.original_filename);

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
          commitments: analysis.commitments,
        },
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    return analysis;
  } catch (error) {
    await supabaseAdmin
      .from('documents')
      .update({ processing_status: 'failed' })
      .eq('id', documentId);
    throw error;
  }
}
