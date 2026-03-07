import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function POST() {
  const authResult = await requireRole(['dg', 'minister', 'ps']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Fetch all projects missing short_name
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, project_name, sub_agency, region, contractor')
      .is('short_name', null)
      .not('project_name', 'is', null)
      .order('contract_value', { ascending: false, nullsFirst: false });

    if (!projects?.length) {
      return NextResponse.json({ updated: 0, message: 'All projects already have short names' });
    }

    // Process in batches of 40 to stay within token limits
    const BATCH_SIZE = 40;
    let totalUpdated = 0;

    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);

      const projectList = batch.map((p, idx) =>
        `${idx + 1}. "${p.project_name}" [agency: ${p.sub_agency || 'N/A'}, region: ${p.region || 'N/A'}]`
      ).join('\n');

      const prompt = `You are shortening project names for a government dashboard in Guyana. Generate a concise display name (max 55 characters) for each project.

Rules:
- Remove redundant context that's already shown in other columns (agency name, region number, "Region X")
- Remove generic procurement language ("Supply and Delivery of", "Engineering, Procurement and Construction for", "EPC for")
- Keep the essential subject matter clear and specific
- Use title case
- Keep location names if they add value beyond the region (e.g. town names like "Lethem", "Linden", "Bartica")
- Abbreviate common terms: "Rehabilitation" → "Rehab", "Construction" → "Constr.", "Infrastructure" → "Infra"
- If the name is already short and clear (under 55 chars), keep it as-is

Examples:
- "ENGINEERING, PROCUREMENT AND CONSTRUCTION FOR INFRASTRUCTURE DEVELOPMENT IN REGION 5" → "Infra Development"
- "Rehabilitation of Karasabai Airstrip, Region 9" → "Rehab Karasabai Airstrip"
- "Supply and Delivery of Two solar System in Lethem" → "Solar Systems – Lethem"
- "Construction of New Demerara Harbour Bridge" → "New Demerara Harbour Bridge"
- "Upgrade of Water Treatment Plant at Shelter Belt" → "Water Treatment Upgrade – Shelter Belt"

Respond with ONLY a JSON array of objects: [{"idx": 1, "short_name": "..."}, ...]

Projects:
${projectList}`;

      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const results: { idx: number; short_name: string }[] = JSON.parse(jsonMatch[0]);

      for (const r of results) {
        const project = batch[r.idx - 1];
        if (!project) continue;
        const shortName = r.short_name.slice(0, 60);
        await supabaseAdmin
          .from('projects')
          .update({ short_name: shortName })
          .eq('id', project.id);
        totalUpdated++;
      }
    }

    return NextResponse.json({ updated: totalUpdated, total: projects.length });
  } catch (error) {
    console.error('Generate short names error:', error);
    return NextResponse.json({ error: 'Failed to generate short names' }, { status: 500 });
  }
}
