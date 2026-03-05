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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Fetch meeting
  const { data: meeting, error: fetchError } = await supabaseAdmin
    .from('meetings')
    .select('id, transcript_text')
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

    // Create new action items
    if (analysis.actionItems?.length) {
      const rows = analysis.actionItems.map((item) => ({
        meeting_id: id,
        task: item.task,
        owner: item.owner || null,
        due_date: item.dueDate || null,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('meeting_actions')
        .insert(rows);

      if (insertError) throw insertError;
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

    // Fetch the created action items to return
    const { data: actionItems } = await supabaseAdmin
      .from('meeting_actions')
      .select('*')
      .eq('meeting_id', id);

    return NextResponse.json({
      summary: analysis.summary,
      decisions: analysis.decisions || [],
      actionItems: actionItems || [],
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
