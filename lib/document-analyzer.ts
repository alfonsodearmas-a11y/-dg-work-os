import Anthropic from '@anthropic-ai/sdk';

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

  try {
    return JSON.parse(content.text);
  } catch {
    // If Claude didn't return valid JSON, extract what we can
    return {
      title: filename,
      summary: 'Unable to analyze document',
      document_type: 'other',
      document_date: null,
      agency: null,
      key_figures: [],
      key_dates: [],
      key_people: [],
      commitments: [],
      tags: [],
      project_reference: null
    };
  }
}
