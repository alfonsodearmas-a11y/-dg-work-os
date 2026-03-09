import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { getProjectById, getProjectNotes, getProjectSummary, upsertProjectSummary } from '@/lib/project-queries';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';

const generateSummarySchema = z.object({
  force: z.boolean().optional(),
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const summary = await getProjectSummary(id);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error({ err: error, projectId: (await params).id }, 'Failed to fetch project summary');
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data } = await parseBody(request, generateSummarySchema);

  try {
    const { id } = await params;
    const force = data?.force ?? false;

    const project = await getProjectById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check cache unless force regenerate
    if (!force) {
      const cached = await getProjectSummary(id);
      if (cached && new Date(cached.generated_at) > new Date(project.updated_at)) {
        return NextResponse.json(cached);
      }
    }

    // Fetch notes for context
    const notes = await getProjectNotes(id);
    const notesContext = notes.length > 0
      ? notes.slice(0, 20).map(n => `[${n.created_at}] ${n.user_name} (${n.user_role}): ${n.note_text}`).join('\n')
      : 'No notes recorded.';

    const fmtValue = project.contract_value
      ? `$${Number(project.contract_value).toLocaleString()}`
      : 'Not specified';

    const prompt = `You are an executive project analyst for the Ministry of Public Utilities and Aviation (Guyana). Analyze this project and provide a structured summary.

## Project Data
- **Name**: ${project.project_name || 'N/A'}
- **ID**: ${project.project_id}
- **Agency**: ${project.sub_agency || project.executing_agency || 'N/A'}
- **Region**: ${project.region ? `Region ${parseInt(project.region, 10)}` : 'N/A'}
- **Contract Value**: ${fmtValue}
- **Contractor**: ${project.contractor || 'N/A'}
- **Completion**: ${project.completion_pct}%
- **End Date**: ${project.project_end_date || 'Not set'}
- **Start Date**: ${project.start_date || 'Not set'}
- **Status**: ${project.status}
- **Health**: ${project.health}
- **Escalated**: ${project.escalated ? 'YES — ' + (project.escalation_reason || 'No reason given') : 'No'}
- **Days Overdue**: ${project.days_overdue > 0 ? project.days_overdue + ' days' : 'N/A'}

## Activity Notes
${notesContext}

## Required Output (JSON)
Respond ONLY with valid JSON matching this structure:
{
  "status_snapshot": "One sentence on where the project stands right now.",
  "timeline_assessment": "Whether on schedule, days ahead/behind, expected vs original target.",
  "budget_position": "Allocated vs disbursed vs remaining. Flag if burn rate suggests overrun.",
  "key_risks": ["Risk 1", "Risk 2"],
  "recommended_actions": ["Action 1", "Action 2", "Action 3"]
}`;

    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const summary = JSON.parse(jsonMatch[0]);
    await upsertProjectSummary(id, summary);

    const result = await getProjectSummary(id);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, projectId: (await params).id }, 'AI project summary generation failed');
    return apiError('SUMMARY_FAILED', 'Failed to generate summary', 500);
  }
}
