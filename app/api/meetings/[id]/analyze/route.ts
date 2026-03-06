import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import OpenAI from 'openai';

export const maxDuration = 60;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface AnalysisResult {
  summary: string;
  decisions: string[];
  actionItems: { task: string; owner: string | null; dueDate: string | null }[];
}

// ── Ambiguity classification ──────────────────────────────────────────────────

const VAGUE_OWNERS = new Set([
  'tbd', 'team', 'ministry', 'all', 'everyone', 'n/a', 'none', 'unknown',
  'various', 'respective', 'stakeholders', 'management', 'leadership',
]);

const AGENCY_NAMES = new Set([
  'gpl', 'gwi', 'cjia', 'gcaa', 'marad', 'heci', 'has', 'ppdi',
]);

function looksLikePersonName(owner: string): boolean {
  const trimmed = owner.trim();
  if (!trimmed) return false;
  // Vague or agency name
  if (VAGUE_OWNERS.has(trimmed.toLowerCase())) return false;
  if (AGENCY_NAMES.has(trimmed.toLowerCase())) return false;
  // A person's name typically has a space (first + last) or is title-cased
  if (trimmed.includes(' ')) return true;
  // Single word but title-cased (e.g. "Alfonso") — accept it
  if (trimmed[0] === trimmed[0].toUpperCase() && trimmed.length >= 3) return true;
  // All lowercase single word — likely not a person
  return false;
}

function classifyAction(item: { task: string; owner: string | null; dueDate: string | null }): {
  confidence: 'AUTO_CREATE' | 'NEEDS_REVIEW';
  review_reason: string | null;
} {
  const reasons: string[] = [];

  // Check owner
  if (!item.owner || !item.owner.trim()) {
    reasons.push('No owner assigned');
  } else if (VAGUE_OWNERS.has(item.owner.trim().toLowerCase())) {
    reasons.push('Owner is vague');
  } else if (AGENCY_NAMES.has(item.owner.trim().toLowerCase())) {
    reasons.push('Owner is an agency, not a person');
  } else if (!looksLikePersonName(item.owner)) {
    reasons.push('Owner unclear');
  }

  // Check due date
  if (!item.dueDate) {
    reasons.push('No due date');
  }

  // Check task text
  const taskText = item.task?.trim() || '';
  if (taskText.length < 10) {
    reasons.push('Task description too short');
  }
  if (taskText.includes('?')) {
    reasons.push('Task contains a question');
  }

  if (reasons.length > 0) {
    return { confidence: 'NEEDS_REVIEW', review_reason: reasons.join('; ') };
  }

  return { confidence: 'AUTO_CREATE', review_reason: null };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  // Fetch meeting
  const { data: meeting, error: fetchError } = await supabaseAdmin
    .from('meetings')
    .select('id, title, transcript_text')
    .eq('id', id)
    .single();

  if (fetchError || !meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (!meeting.transcript_text) {
    return NextResponse.json({ error: 'No transcript available for this meeting' }, { status: 400 });
  }

  try {
    // Update status to ANALYZING
    await supabaseAdmin
      .from('meetings')
      .update({ status: 'ANALYZING', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Call GPT-4o
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an executive assistant for Alfonso De Armas, Director General of Guyana's Ministry of Public Utilities and Aviation, overseeing GPL, GWI, CJIA, GCAA, MARAD, HECI and Hinterland Airstrips. Analyze the transcript and return ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary in ministerial tone",
  "decisions": ["Decision 1"],
  "actionItems": [{ "task": "...", "owner": "...", "dueDate": "YYYY-MM-DD or null" }]
}`,
        },
        { role: 'user', content: meeting.transcript_text },
      ],
    });

    const raw = completion.choices[0].message.content;
    if (!raw) throw new Error('Empty response from GPT-4o');

    const analysis: AnalysisResult = JSON.parse(raw);

    // Delete existing action items for this meeting
    await supabaseAdmin
      .from('meeting_actions')
      .delete()
      .eq('meeting_id', id);

    // Create new action items with confidence classification
    let createdActions: Record<string, unknown>[] = [];
    if (analysis.actionItems?.length) {
      const rows = analysis.actionItems.map((item) => {
        const { confidence, review_reason } = classifyAction(item);
        return {
          meeting_id: id,
          task: item.task,
          owner: item.owner || null,
          due_date: item.dueDate || null,
          confidence,
          review_reason,
        };
      });

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('meeting_actions')
        .insert(rows)
        .select();

      if (insertError) throw insertError;
      createdActions = inserted || [];
    }

    // Auto-create tasks for AUTO_CREATE items
    const autoCreateItems = createdActions.filter(
      (a) => a.confidence === 'AUTO_CREATE'
    );

    for (const action of autoCreateItems) {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .insert({
          title: action.task as string,
          description: `From meeting: ${meeting.title}`,
          status: 'new',
          priority: 'medium',
          due_date: (action.due_date as string) || null,
          role: 'Meeting Action Item',
          owner_user_id: session.user.id,
          source_meeting_id: id,
        })
        .select('id')
        .single();

      if (task) {
        await supabaseAdmin
          .from('meeting_actions')
          .update({ task_id: task.id })
          .eq('id', action.id as string);

        // Update local reference
        (action as Record<string, unknown>).task_id = task.id;
      }
    }

    // Update meeting with summary, decisions, status
    const { error: updateError } = await supabaseAdmin
      .from('meetings')
      .update({
        summary: analysis.summary,
        decisions: analysis.decisions || [],
        status: 'ANALYZED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({
      summary: analysis.summary,
      decisions: analysis.decisions || [],
      actionItems: createdActions,
    });
  } catch (err) {
    console.error('[Meetings Analyze] Error:', err);

    await supabaseAdmin
      .from('meetings')
      .update({ status: 'ERROR', updated_at: new Date().toISOString() })
      .eq('id', id);

    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
