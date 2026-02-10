// Claude transcript processor for meeting recordings — outputs structured JSON

import Anthropic from '@anthropic-ai/sdk';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecordingActionItem {
  title: string;
  description: string;
  assigned_to: string | null;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  agency: string | null;
  context: string | null;
}

export interface RecordingAnalysis {
  summary: string;
  action_items: RecordingActionItem[];
  decisions: string[];
  follow_ups: string[];
}

// ── Lazy Anthropic client (same pattern as meeting-minutes.ts) ─────────────

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior executive assistant analyzing meeting recordings for the Director General of the Ministry of Public Utilities and Aviation, Guyana.

Given a meeting transcript (possibly with speaker labels), produce a structured JSON analysis.

Your output must be a single valid JSON object with this exact structure:
{
  "summary": "2-4 paragraph executive summary of the meeting",
  "action_items": [
    {
      "title": "Brief action title",
      "description": "Detailed description of what needs to be done",
      "assigned_to": "Person name or null if unclear",
      "deadline": "YYYY-MM-DD or null if not specified",
      "priority": "high|medium|low",
      "agency": "GPL|GWI|CJIA|GCAA|Ministry or null",
      "context": "Brief quote from the transcript supporting this action item, or null if unclear"
    }
  ],
  "decisions": [
    "Decision 1 that was made during the meeting",
    "Decision 2..."
  ],
  "follow_ups": [
    "Item that needs follow-up but isn't a concrete action item",
    "Topic to revisit in next meeting..."
  ]
}

Rules:
- Extract ALL concrete action items with clear owners where possible
- Distinguish between decisions (already made) and follow-ups (need further discussion)
- Use agency codes: GPL (power), GWI (water), CJIA (airport), GCAA (aviation), Ministry
- Set priority based on urgency and impact discussed
- For each action item, include a brief verbatim or near-verbatim excerpt from the transcript that supports it (the "context" field). This helps the reviewer understand where the action came from.
- Output ONLY the JSON object, no markdown fences or extra text`;

// ── Process Transcript ─────────────────────────────────────────────────────

export async function processRecordingTranscript(
  transcript: string,
  context: {
    title: string;
    meeting_date: string | null;
    attendees: string[];
    notes?: string | null;
  },
): Promise<{ analysis: RecordingAnalysis; tokensUsed: number }> {
  const userPrompt = `Meeting: ${context.title}
Date: ${context.meeting_date || 'Not specified'}
Attendees: ${context.attendees.length > 0 ? context.attendees.join(', ') : 'Not specified'}
${context.notes ? `Notes: ${context.notes}` : ''}

--- TRANSCRIPT ---
${transcript}`;

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('\n');

  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // Parse JSON — handle possible code fences
  let jsonStr = responseText.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let analysis: RecordingAnalysis;
  try {
    analysis = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  // Validate structure
  if (!analysis.summary || !Array.isArray(analysis.action_items)) {
    throw new Error('AI response missing required fields (summary, action_items)');
  }
  if (!Array.isArray(analysis.decisions)) analysis.decisions = [];
  if (!Array.isArray(analysis.follow_ups)) analysis.follow_ups = [];

  return { analysis, tokensUsed };
}
