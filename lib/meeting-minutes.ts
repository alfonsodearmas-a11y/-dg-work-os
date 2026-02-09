import { supabaseAdmin } from '@/lib/db';
import { fetchMeetings, fetchPageBlocks } from '@/lib/notion';
import Anthropic from '@anthropic-ai/sdk';
import type { Meeting } from '@/lib/notion';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MeetingMinutes {
  id: string;
  notion_meeting_id: string;
  title: string;
  meeting_date: string | null;
  attendees: string[];
  category: string | null;
  raw_transcript: string | null;
  transcript_block_count: number;
  minutes_markdown: string | null;
  action_items: ActionItem[];
  ai_model: string | null;
  ai_tokens_used: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | 'edited';
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  source_meeting: string;
  agency: string | null;
}

// ── Anthropic Client ───────────────────────────────────────────────────────

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

const SYSTEM_PROMPT = `You are a senior executive assistant generating meeting minutes for the Director General of the Ministry of Public Utilities and Aviation, Guyana.

Given a meeting transcript, produce:

1. MEETING MINUTES in clean Markdown:
   - Meeting title, date, attendees
   - Key discussion points (organized by topic)
   - Decisions made
   - Action items with owners and deadlines

2. ACTION ITEMS as a JSON array:
[{
  "id": "AI-001",
  "title": "Brief action title",
  "description": "Detailed description",
  "assigned_to": "Person name or role",
  "deadline": "YYYY-MM-DD or null if not specified",
  "priority": "high|medium|low",
  "source_meeting": "Meeting title",
  "agency": "GPL|GWI|CJIA|GCAA|Ministry|null"
}]

Format your response as:
---MINUTES---
[markdown content]
---ACTION_ITEMS---
[json array]`;

// ── Response Parsing ───────────────────────────────────────────────────────

function parseAIResponse(response: string, meetingTitle: string): { markdown: string; actionItems: ActionItem[] } {
  let markdown = '';
  let actionItems: ActionItem[] = [];

  const minutesMatch = response.split('---MINUTES---');
  if (minutesMatch.length > 1) {
    const afterMinutes = minutesMatch[1];
    const actionSplit = afterMinutes.split('---ACTION_ITEMS---');
    markdown = actionSplit[0].trim();

    if (actionSplit.length > 1) {
      try {
        let jsonStr = actionSplit[1].trim();
        // Extract JSON from code fences if present
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1];
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) jsonStr = arrayMatch[0];
        actionItems = JSON.parse(jsonStr);
      } catch {
        actionItems = [];
      }
    }
  } else {
    // Fallback: treat entire response as minutes markdown
    markdown = response.trim();
  }

  return { markdown, actionItems };
}

// ── Database Operations ────────────────────────────────────────────────────

export async function getMinutesList(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ meetings: MeetingMinutes[]; total: number }> {
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  let query = supabaseAdmin
    .from('meeting_minutes')
    .select('*', { count: 'exact' })
    .order('meeting_date', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch meeting minutes: ${error.message}`);

  return {
    meetings: (data || []) as MeetingMinutes[],
    total: count || 0,
  };
}

export async function getMinutesById(id: string): Promise<MeetingMinutes | null> {
  const { data, error } = await supabaseAdmin
    .from('meeting_minutes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to fetch meeting: ${error.message}`);
  }

  return data as MeetingMinutes;
}

// ── Sync Logic ─────────────────────────────────────────────────────────────

export async function syncNewMeetings(): Promise<{ newCount: number; existingCount: number }> {
  // Fetch meetings from Notion (last 90 days)
  const notionMeetings = await fetchMeetings(90);

  // Get existing notion_meeting_ids from our table
  const { data: existing } = await supabaseAdmin
    .from('meeting_minutes')
    .select('notion_meeting_id');

  const existingIds = new Set((existing || []).map((r: any) => r.notion_meeting_id));

  // Find new meetings
  const newMeetings = notionMeetings.filter(m => !existingIds.has(m.notion_id));

  // Insert new meetings as pending
  if (newMeetings.length > 0) {
    const rows = newMeetings.map((m: Meeting) => ({
      notion_meeting_id: m.notion_id,
      title: m.title,
      meeting_date: m.meeting_date,
      attendees: m.attendees,
      category: m.category,
      status: 'pending',
    }));

    const { error } = await supabaseAdmin
      .from('meeting_minutes')
      .insert(rows);

    if (error) throw new Error(`Failed to insert new meetings: ${error.message}`);
  }

  return {
    newCount: newMeetings.length,
    existingCount: existingIds.size,
  };
}

// ── Process a Single Meeting ───────────────────────────────────────────────

export async function processOneMeeting(minutesId: string): Promise<MeetingMinutes> {
  // Fetch the row
  const row = await getMinutesById(minutesId);
  if (!row) throw new Error('Meeting minutes row not found');

  // Set status to processing
  await supabaseAdmin
    .from('meeting_minutes')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', minutesId);

  try {
    // Fetch transcript from Notion
    let transcript: string;
    let unsupportedTypes: string[] = [];
    try {
      const result = await fetchPageBlocks(row.notion_meeting_id);
      transcript = result.text;
      unsupportedTypes = result.unsupportedTypes;
    } catch (fetchError: any) {
      const errorMsg = `Transcript fetch error: ${fetchError.message || 'Unknown error'}`;
      console.error(`[meeting-minutes] ${errorMsg} for meeting "${row.title}" (${minutesId})`);
      const { data } = await supabaseAdmin
        .from('meeting_minutes')
        .update({
          status: 'failed',
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', minutesId)
        .select()
        .single();
      return data as MeetingMinutes;
    }

    const blockCount = transcript.split('\n').filter(l => l.trim()).length;

    // Update transcript
    await supabaseAdmin
      .from('meeting_minutes')
      .update({ raw_transcript: transcript, transcript_block_count: blockCount })
      .eq('id', minutesId);

    // Skip if transcript is too short
    const trimmedLength = transcript.trim().length;
    const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (!transcript || trimmedLength < 50) {
      let reason: string;
      if (unsupportedTypes.length > 0) {
        reason = `Transcript is inside a Notion ${unsupportedTypes[0]} block which is not accessible via the API. Please paste the transcript manually.`;
      } else if (!transcript || trimmedLength === 0) {
        reason = 'No transcript found on Notion page';
      } else {
        reason = `Transcript too short (${wordCount} word${wordCount !== 1 ? 's' : ''}, ${trimmedLength} chars)`;
      }
      console.warn(`[meeting-minutes] Skipping "${row.title}" (${minutesId}): ${reason}`);
      const { data } = await supabaseAdmin
        .from('meeting_minutes')
        .update({
          status: 'skipped',
          error_message: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', minutesId)
        .select()
        .single();
      return data as MeetingMinutes;
    }

    // Build prompt
    const userPrompt = `Meeting: ${row.title}
Date: ${row.meeting_date || 'Not specified'}
Attendees: ${row.attendees?.join(', ') || 'Not specified'}
Category: ${row.category || 'General'}

--- TRANSCRIPT ---
${transcript}`;

    // Call Claude Opus
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

    // Parse response
    const { markdown, actionItems } = parseAIResponse(responseText, row.title);

    // Update row with results
    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        minutes_markdown: markdown,
        action_items: actionItems,
        ai_model: 'claude-opus-4-6',
        ai_tokens_used: tokensUsed,
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  } catch (error: any) {
    // Set failed status
    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  }
}

// ── Regenerate Minutes ─────────────────────────────────────────────────────

export async function regenerateMinutes(minutesId: string): Promise<MeetingMinutes> {
  const row = await getMinutesById(minutesId);
  if (!row) throw new Error('Meeting minutes row not found');

  // Always re-fetch transcript from Notion (the whole point of "Re-fetch & Process")
  let transcript: string;
  let unsupportedTypes: string[] = [];
  try {
    const result = await fetchPageBlocks(row.notion_meeting_id);
    transcript = result.text;
    unsupportedTypes = result.unsupportedTypes;
  } catch (fetchError: any) {
    const errorMsg = `Transcript fetch error: ${fetchError.message || 'Unknown error'}`;
    console.error(`[meeting-minutes] ${errorMsg} for meeting "${row.title}" (${minutesId})`);
    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        status: 'failed',
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();
    return data as MeetingMinutes;
  }

  const blockCount = transcript.split('\n').filter(l => l.trim()).length;

  // Save the freshly fetched transcript
  await supabaseAdmin
    .from('meeting_minutes')
    .update({
      raw_transcript: transcript,
      transcript_block_count: blockCount,
    })
    .eq('id', minutesId);

  // Set processing
  await supabaseAdmin
    .from('meeting_minutes')
    .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', minutesId);

  try {
    const trimmedLength = transcript.trim().length;
    const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (!transcript || trimmedLength < 50) {
      let reason: string;
      if (unsupportedTypes.length > 0) {
        reason = `Transcript is inside a Notion ${unsupportedTypes[0]} block which is not accessible via the API. Please paste the transcript manually.`;
      } else if (!transcript || trimmedLength === 0) {
        reason = 'No transcript found on Notion page';
      } else {
        reason = `Transcript too short (${wordCount} word${wordCount !== 1 ? 's' : ''}, ${trimmedLength} chars)`;
      }
      console.warn(`[meeting-minutes] Skipping "${row.title}" (${minutesId}): ${reason}`);
      const { data } = await supabaseAdmin
        .from('meeting_minutes')
        .update({
          status: 'skipped',
          error_message: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', minutesId)
        .select()
        .single();
      return data as MeetingMinutes;
    }

    const userPrompt = `Meeting: ${row.title}
Date: ${row.meeting_date || 'Not specified'}
Attendees: ${row.attendees?.join(', ') || 'Not specified'}
Category: ${row.category || 'General'}

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
    const { markdown, actionItems } = parseAIResponse(responseText, row.title);

    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        minutes_markdown: markdown,
        action_items: actionItems,
        ai_model: 'claude-opus-4-6',
        ai_tokens_used: tokensUsed,
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  } catch (error: any) {
    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  }
}

// ── Process with Manual Transcript ────────────────────────────────────────

export async function processWithManualTranscript(minutesId: string, transcript: string): Promise<MeetingMinutes> {
  const row = await getMinutesById(minutesId);
  if (!row) throw new Error('Meeting minutes row not found');

  const blockCount = transcript.split('\n').filter(l => l.trim()).length;

  // Save the manual transcript
  await supabaseAdmin
    .from('meeting_minutes')
    .update({
      raw_transcript: transcript,
      transcript_block_count: blockCount,
      status: 'processing',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', minutesId);

  try {
    const userPrompt = `Meeting: ${row.title}
Date: ${row.meeting_date || 'Not specified'}
Attendees: ${row.attendees?.join(', ') || 'Not specified'}
Category: ${row.category || 'General'}

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
    const { markdown, actionItems } = parseAIResponse(responseText, row.title);

    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        minutes_markdown: markdown,
        action_items: actionItems,
        ai_model: 'claude-opus-4-6',
        ai_tokens_used: tokensUsed,
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  } catch (error: any) {
    const { data } = await supabaseAdmin
      .from('meeting_minutes')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', minutesId)
      .select()
      .single();

    return data as MeetingMinutes;
  }
}

// ── Update Minutes (manual edit) ───────────────────────────────────────────

export async function updateMinutes(minutesId: string, markdown: string): Promise<MeetingMinutes> {
  const { data, error } = await supabaseAdmin
    .from('meeting_minutes')
    .update({
      minutes_markdown: markdown,
      status: 'edited',
      updated_at: new Date().toISOString(),
    })
    .eq('id', minutesId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update minutes: ${error.message}`);
  return data as MeetingMinutes;
}
